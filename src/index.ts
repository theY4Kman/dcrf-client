import autobind from 'autobind-decorator';
import { getLogger } from 'loglevel';

import UUID from './lib/UUID';

import {
  IDCRFOptions,
  IDispatcher,
  ISendQueue,
  ISerializer,
  IStreamingAPI,
  ITransport,
  IMessageEvent,
  SubscriptionAction,
  SubscriptionHandler, DispatchListener,
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

  public list(stream: string, data: object={}): Promise<object> {
    return this.request(stream, {
      action: 'list',
      data,
    });
  }

  public create(stream: string, props: object): Promise<object> {
    return this.request(stream, {
      action: 'create',
      data: props,
    });
  }

  public retrieve(stream: string, pk: number, data: object={}): Promise<object> {
    return this.request(stream, {
      action: 'retrieve',
      pk,
      data,
    });
  }

  public update(stream: string, pk: number, props: object): Promise<object> {
    return this.request(stream, {
      action: 'update',
      pk,
      data: props,
    });
  }

  public delete(stream: string, pk: number, data: object={}): Promise<object> {
    return this.request(stream, {
      action: 'delete',
      pk,
      data,
    });
  }

  public subscribe(stream: string,
            action: SubscriptionAction,
            pk?: number | SubscriptionHandler,
            callback?: SubscriptionHandler): SubscriptionPromise<object> {
    if (typeof pk === 'function') {
      callback = pk;
      pk = undefined;
    }

    if (callback == null) {
      throw new Error('callback must be provided');
    }

    const selector = DCRFClient.buildSubscriptionSelector(stream, action, pk);
    const handler: (data: typeof selector & {payload: {data: any}}) => void = this.buildListener(callback);const payload = DCRFClient.buildSubscribePayload(action, pk);

    const listenerId = this.dispatcher.listen(selector, handler);
    const message = DCRFClient.buildMultiplexedMessage(stream, payload);
    this.subscriptions[listenerId] = {selector, handler, message};

    const requestPromise = this.request(stream, payload);
    const unsubscribe = this.unsubscribe.bind(this, listenerId);

    return new SubscriptionPromise((resolve, reject) => {
      requestPromise.then(resolve, reject);
    }, unsubscribe);
  }

  /**
   * Send subscription requests for all registered subscriptions
   */
  public resubscribe() {
    const subscriptions = Object.values(this.subscriptions);

    log.info('Resending %d subscription requests', subscriptions.length);

    for (const {message} of subscriptions) {
      this.sendNow(message);
    }
  }

  public request(stream: string, payload: object, requestId: string=UUID.generate()): Promise<object> {
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

  protected static buildSubscribePayload(action: string, pk?: number) {
    const payload = {
      action: 'subscribe',
      data: {action, pk},
    };

    if (pk == null) {
      delete payload.data.pk;
    }

    return payload;
  }

  protected static buildSubscriptionSelector(stream: string, action: string, pk?: number) {
    const selector = {
      stream,
      payload: {action, pk}
    };

    if (pk == null) {
      delete selector.payload.pk;
    }

    return selector;
  }

  /**
   * Build a function which will take an entire JSON message and return only
   * the relevant payload (usually an object).
   */
  protected buildListener(callback: (data: object) => void): DispatchListener<{payload: {data: any}}> {
    return (data: {payload: {data: any}}) => {
      return callback(data.payload.data);
    };
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
    const dispatcher = new FifoDispatcher();
    const transport = new WebsocketTransport(url, options.websocket);
    const queue = new FifoQueue();
    const serializer = new JSONSerializer();
    return new DCRFClient(dispatcher, transport, queue, serializer, options);
  },
};
