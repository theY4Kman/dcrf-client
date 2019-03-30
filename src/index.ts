import autobind from 'autobind-decorator';
import {getLogger} from 'loglevel';

import UUID from './lib/UUID';

import {
  DispatchListener,
  IDCRFOptions,
  IDispatcher,
  IMessageEvent,
  ISendQueue,
  ISerializer,
  IStreamingAPI,
  ITransport,
  SubscriptionAction,
  SubscriptionHandler,
} from './interface';

import {SubscriptionPromise} from './subscriptions';
import FifoDispatcher from './dispatchers/fifo';
import WebsocketTransport from './transports/websocket';
import FifoQueue from './send_queues/fifo';
import JSONSerializer from './serializers/json';


const log = getLogger('dcrf');


interface ISubscriptionDescriptor<S, P extends S> {
  selector: S,
  handler: DispatchListener<P>,
  message: object,
}

export
class DCRFClient implements IStreamingAPI {
  public readonly dispatcher: IDispatcher;
  public readonly transport: ITransport;
  public readonly queue: ISendQueue;
  public readonly serializer: ISerializer;
  public readonly options: IDCRFOptions;

  public readonly subscriptions: {[listenerId: number]: ISubscriptionDescriptor<any, any>};

  /**
   * @param dispatcher Dispatcher instance to route incoming frames to associated handlers
   * @param transport Transport to send and receive messages over the wire.
   * @param queue Instance of Queue to queue messages when transport unavailable.
   * @param serializer Instance which handles serializing data to be sent, and
   *                   deserializing received data.
   * @param options Configuration to customize how DCRFClient operates. See
   *                the IDCRFOptions type for more information.
   */
  constructor(dispatcher: IDispatcher,
              transport: ITransport,
              queue: ISendQueue,
              serializer: ISerializer,
              options: IDCRFOptions={}) {
    this.dispatcher = dispatcher;
    this.transport = transport;
    this.queue = queue;
    this.serializer = serializer;
    this.options = options;

    this.queue.initialize(this.transport.send, this.transport.isConnected);
    this.subscriptions = {};
  }

  public initialize() {
    this.transport.connect();
    this.transport.on('message', this.handleTransportMessage);
    this.transport.on('connect', this.handleTransportConnect);
    this.transport.on('reconnect', this.handleTransportReconnect);
  }

  public list(stream: string, data: object={}): Promise<any> {
    return this.request(stream, {
      action: 'list',
      data,
    });
  }

  public create(stream: string, props: object): Promise<any> {
    return this.request(stream, {
      action: 'create',
      data: props,
    });
  }

  public retrieve(stream: string, pk: number, data: object={}): Promise<any> {
    return this.request(stream, {
      action: 'retrieve',
      pk,
      data,
    });
  }

  public update(stream: string, pk: number, props: object): Promise<any> {
    return this.request(stream, {
      action: 'update',
      pk,
      data: props,
    });
  }

  public patch(stream: string, pk: number, props: object): Promise<any> {
    return this.request(stream, {
      action: 'patch',
      pk,
      data: props,
    });
  }

  public delete(stream: string, pk: number, data: object={}): Promise<any> {
    return this.request(stream, {
      action: 'delete',
      pk,
      data,
    });
  }

  public subscribe(
      stream: string,
      pk: number,
      callback: SubscriptionHandler,
      requestId?: string,
  ): SubscriptionPromise<object>
  {
    if (callback == null) {
      throw new Error('callback must be provided');
    }

    if (requestId == null) {
      requestId = UUID.generate();
    }

    const selector = DCRFClient.buildSubscribeSelector(stream, pk, requestId);
    const handler: (data: typeof selector & {payload: {data: any, action: string}}) => void = this.buildSubscribeListener(callback);
    const payload = DCRFClient.buildSubscribePayload(pk, requestId);

    const listenerId = this.dispatcher.listen(selector, handler);
    const message = DCRFClient.buildMultiplexedMessage(stream, payload);
    this.subscriptions[listenerId] = {selector, handler, message};

    const requestPromise = this.request(stream, payload, requestId);
    const unsubscribe = this.unsubscribe.bind(this, listenerId);

    return new SubscriptionPromise((resolve, reject) => {
      requestPromise.then(resolve, reject);
    }, unsubscribe);
  }

  /**
   * Send subscription requests for all registered subscriptions
   */
  public resubscribe() {
    const subscriptions: Array<{message: object}> = Object.values(this.subscriptions);

    log.info('Resending %d subscription requests', subscriptions.length);

    for (const {message} of subscriptions) {
      this.sendNow(message);
    }
  }

  public request(stream: string, payload: object, requestId: string=UUID.generate()): Promise<any> {
    return new Promise((resolve, reject) => {
      const selector = DCRFClient.buildRequestResponseSelector(stream, requestId);

      this.dispatcher.once(selector, (data: typeof selector & {payload: {response_status: number, data: any}}) => {
        const {payload: response} = data;
        const responseStatus = response.response_status;

        // 2xx is success
        if (Math.floor(responseStatus / 100) === 2) {
          resolve(response.data);
        } else {
          reject(response);
        }
      });

      payload = Object.assign({}, payload, {request_id: requestId});
      if (this.options.preprocessPayload != null) {
        // Note: this and the preprocessMessage handler below presume an object will be returned.
        //       If you really want to return a 0, you're kinda SOL -- wrap it in an object :P
        payload = this.options.preprocessPayload(stream, payload, requestId) || payload;
      }

      let message: {stream?: string, payload?: any} = DCRFClient.buildMultiplexedMessage(stream, payload);
      if (this.options.preprocessMessage != null) {
        message = this.options.preprocessMessage(message) || message;
      }

      this.send(message);
    });
  }

  public send(object: object) {
    return this.doSend(object, this.queue.send);
  }

  public sendNow(object: object) {
    return this.doSend(object, this.queue.sendNow);
  }

  protected doSend(object: object, send: (bytes: string) => number) {
    const bytes: string = this.serializer.serialize(object);
    return send(bytes);
  }

  protected unsubscribe(listenerId: number): boolean {
    // TODO: send unsubscription message (unsupported by channels-api at time of writing)
    const found = this.subscriptions.hasOwnProperty(listenerId);
    if (found) {
      this.dispatcher.cancel(listenerId);
      delete this.subscriptions[listenerId];
    }
    return found;
  }

  @autobind
  protected handleTransportMessage(event: IMessageEvent) {
    const data = this.serializer.deserialize(event.data);
    return this.handleMessage(data);
  }

  protected handleMessage(data: object) {
    this.dispatcher.dispatch(data);
  }

  @autobind
  protected handleTransportConnect() {
    log.debug('Initial API connection over transport %s', this.transport);
    this.queue.processQueue();
  }

  @autobind
  protected handleTransportReconnect() {
    log.debug('Reestablished API connection');
    this.resubscribe();
    this.queue.processQueue();
  }

  protected static buildMultiplexedMessage(stream: string, payload: object) {
    return {stream, payload};
  }

  protected static buildRequestResponseSelector(stream: string, requestId: string) {
    return {
      stream,
      payload: {request_id: requestId},
    };
  }

  protected static buildSubscribeSelector(stream: string, pk: number, requestId: string) {
    return {
      stream,
      payload: {
        data: {pk},
        request_id: requestId,
      },
    };
  }

  protected static buildSubscribePayload(pk: number, requestId: string) {
    return {
      action: 'subscribe_instance',
      request_id: requestId,
      pk,
    };
  }

  /**
   * Build a function which will take an entire JSON message and return only
   * the relevant payload (usually an object).
   */
  protected buildListener(
      callback: (data: {[prop: string]: any}, response: {[prop: string]: any}) => void
  ): DispatchListener<{payload: {data: any}}>
  {
    return (data: {payload: {data: any}}) => {
      return callback(data.payload.data, data);
    };
  }

  /**
   * Build a function which will take an entire JSON message and return only
   * the relevant payload (usually an object).
   */
  protected buildSubscribeListener(
      callback: (data: object, action: string) => void
  ): DispatchListener<{payload: {data: any, action: string}}>
  {
    return this.buildListener((data, response) => {
      const action = response.payload.action;
      return callback(data, action);
    })
  }
}


export default {
  /**
   * Configure a DCRFClient client and begin connection
   *
   * @param url WebSocket URL to connect to
   * @param options Configuration for DCRFClient and ReconnectingWebsocket
   */
  connect(url: string, options: IDCRFOptions={}): DCRFClient {
    const client = this.createClient(url, options);
    client.initialize();
    return client;
  },

  /**
   * Create a configured DCRFClient client instance, using default components
   *
   * @param url WebSocket URL to connect to
   * @param options Configuration for DCRFClient and ReconnectingWebsocket
   */
  createClient(url: string, options: IDCRFOptions={}): DCRFClient {
    const dispatcher: IDispatcher = options.dispatcher || new FifoDispatcher();
    const transport: ITransport = options.transport || new WebsocketTransport(url, options.websocket);
    const queue: ISendQueue = options.queue || new FifoQueue();
    const serializer: ISerializer = options.serializer || new JSONSerializer();
    return new DCRFClient(dispatcher, transport, queue, serializer, options);
  },
};
