import autobind from 'autobind-decorator';
import {getLogger} from './logging';
import FifoDispatcher from './dispatchers/fifo';

import {
  DispatchListener,
  IDCRFOptions,
  IDispatcher,
  IMessageEvent,
  ISendQueue,
  ISerializer,
  IStreamingAPI,
  ITransport,
  SubscriptionHandler,
  SubscribeOptions,
} from './interface';

import UUID from './lib/UUID';
import FifoQueue from './send_queues/fifo';
import JSONSerializer from './serializers/json';

import {SubscriptionPromise} from './subscriptions';
import WebsocketTransport from './transports/websocket';
import uniqBy from "lodash.uniqby";


const log = getLogger('dcrf');


interface ISubscriptionDescriptor<S, P extends S> {
  selector: S,
  handler: DispatchListener<P>,
  message: object,
  unsubscribeMessage: object,
}

export
class DCRFClient implements IStreamingAPI {
  public readonly dispatcher: IDispatcher;
  public readonly transport: ITransport;
  public readonly queue: ISendQueue;
  public readonly serializer: ISerializer;
  public readonly options: IDCRFOptions;
  public readonly pkField: string;
  public readonly ensurePkFieldInDeleteEvents: boolean;

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

    this.pkField = options.pkField || 'pk';
    this.ensurePkFieldInDeleteEvents =
        options.ensurePkFieldInDeleteEvents != null
            ? options.ensurePkFieldInDeleteEvents
            : true;

    if (this.options.buildMultiplexedMessage)
      this.buildMultiplexedMessage = this.options.buildMultiplexedMessage.bind(this);
    if (this.options.buildRequestResponseSelector)
      this.buildRequestResponseSelector = this.options.buildRequestResponseSelector.bind(this);
    if (this.options.buildSubscribeCreateSelector)
      this.buildSubscribeCreateSelector = this.options.buildSubscribeCreateSelector.bind(this);
    if (this.options.buildSubscribeUpdateSelector)
      this.buildSubscribeUpdateSelector = this.options.buildSubscribeUpdateSelector.bind(this);
    if (this.options.buildSubscribeDeleteSelector)
      this.buildSubscribeDeleteSelector = this.options.buildSubscribeDeleteSelector.bind(this);
    if (this.options.buildSubscribePayload)
      this.buildSubscribePayload = this.options.buildSubscribePayload.bind(this);
    if (this.options.buildUnsubscribePayload)
      this.buildUnsubscribePayload = this.options.buildUnsubscribePayload.bind(this);

    this.queue.initialize(this.transport.send, this.transport.isConnected);
    this.subscriptions = {};
  }

  public initialize() {
    this.transport.connect();
    this.transport.on('message', this.handleTransportMessage);
    this.transport.on('connect', this.handleTransportConnect);
    this.transport.on('reconnect', this.handleTransportReconnect);
  }

  public close(unsubscribe: boolean = true) {
    if (unsubscribe) {
      this.unsubscribeAll();
    }

    this.transport.disconnect();
  }

  public list(stream: string, data: object={}, requestId?: string): Promise<any> {
    return this.request(stream, {
      action: 'list',
      data,
    }, requestId);
  }

  public create(stream: string, props: object, requestId?: string): Promise<any> {
    return this.request(stream, {
      action: 'create',
      data: props,
    }, requestId);
  }

  public retrieve(stream: string, pk: number, data: object={}, requestId?: string): Promise<any> {
    return this.request(stream, {
      action: 'retrieve',
      pk,
      data,
    }, requestId);
  }

  public update(stream: string, pk: number, props: object, requestId?: string): Promise<any> {
    return this.request(stream, {
      action: 'update',
      pk,
      data: props,
    }, requestId);
  }

  public patch(stream: string, pk: number, props: object, requestId?: string): Promise<any> {
    return this.request(stream, {
      action: 'patch',
      pk,
      data: props,
    }, requestId);
  }

  public delete(stream: string, pk: number, data: object={}, requestId?: string): Promise<any> {
    return this.request(stream, {
      action: 'delete',
      pk,
      data,
    }, requestId);
  }

  public subscribe(
      stream: string,
      args: object|number,
      callback: SubscriptionHandler,
      options?: SubscribeOptions|string,
  ): SubscriptionPromise<object>
  {
    if (callback == null) {
      throw new Error('callback must be provided');
    }

    if (typeof options === 'string') {
      options = {
        requestId: options
      };
    }

    if (!options) {
      options = {};
    }

    if (!options.create) {
      options.create = false;
    }

    if (!options.requestId) {
      options.requestId = UUID.generate();
    }

    if (!options.subscribeAction) {
      options.subscribeAction = 'subscribe_instance';
    }

    if (!options.unsubscribeAction) {
      options.unsubscribeAction = 'unsubscribe_instance';
    }

    if (args !== null && typeof args !== 'object') {
        args = {
          [options.subscribeAction === 'subscribe_instance' ? 'pk' : this.pkField]: args
        };
    }

    const requestId = options.requestId;

    const createSelector = this.buildSubscribeCreateSelector(stream, requestId);
    const updateSelector = this.buildSubscribeUpdateSelector(stream, requestId);
    const deleteSelector = this.buildSubscribeDeleteSelector(stream, requestId);
    const handler: (data: typeof updateSelector & {payload: {data: any, action: string}}) => void =
        this.buildSubscribeListener(callback);
    const payload = this.buildSubscribePayload(options.subscribeAction, args, requestId);
    const unsubscribePayload = this.buildUnsubscribePayload(options.unsubscribeAction, args, requestId);

    const message = this.buildMultiplexedMessage(stream, payload);
    const unsubscribeMessage = this.buildMultiplexedMessage(stream, payload);
    const createListenerId = options.create ? this.dispatcher.listen(createSelector, handler) : null;
    const updateListenerId = this.dispatcher.listen(updateSelector, handler);
    const deleteListenerId = this.dispatcher.listen(deleteSelector, handler);

    if (createListenerId) {
      this.subscriptions[createListenerId] = {selector: createSelector, handler, message, unsubscribeMessage};
    }
    this.subscriptions[updateListenerId] = {selector: updateSelector, handler, message, unsubscribeMessage};
    this.subscriptions[deleteListenerId] = {selector: deleteSelector, handler, message, unsubscribeMessage};

    const requestPromise = this.request(stream, payload, requestId);
    const unsubscribe = async () => {
      const create = createListenerId ? this.unsubscribe(createListenerId) : false;
      const subbed = create || this.unsubscribe(updateListenerId) || this.unsubscribe(deleteListenerId);
      await this.request(stream, unsubscribeMessage, requestId)
      return subbed;
    };

    return new SubscriptionPromise((resolve, reject) => {
      requestPromise.then(resolve, reject);
    }, unsubscribe);
  }

  public unsubscribeAll(): number {
    const listenerIds = Object.keys(this.subscriptions).map(parseInt);
    listenerIds.forEach(listenerId => this._unsubscribeUnsafe(listenerId));

    log.info('Removing %d listeners', listenerIds.length);

    const subscriptions: Array<ISubscriptionDescriptor<any, any>> = Object.values(this.subscriptions);
    const unsubscribeMessages = uniqBy(subscriptions, (s) => {
      // @ts-ignore
      return s.unsubscribeMessage.payload.request_id
    });

    log.info('Sending %d unsubscription requests', unsubscribeMessages.length);

    for (const {unsubscribeMessage} of unsubscribeMessages) {
      this.sendNow(unsubscribeMessage);
    }
    return listenerIds.length;
  }

  /**
   * Send subscription requests for all registered subscriptions
   */
  public resubscribe() {
    const subscriptions: Array<ISubscriptionDescriptor<any, any>> = Object.values(this.subscriptions);
    const resubscribeMessages = uniqBy(subscriptions, (s) => {
      // @ts-ignore
      return s.message.payload.request_id
    })

    log.info('Resending %d subscription requests', subscriptions.length);

    for (const {message} of resubscribeMessages) {
      this.sendNow(message);
    }
  }

  public request(stream: string, payload: object, requestId: string=UUID.generate()): Promise<any> {
    return new Promise((resolve, reject) => {
      const selector = this.buildRequestResponseSelector(stream, requestId);

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

      let message = this.buildMultiplexedMessage(stream, payload);
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
    if (this.subscriptions.hasOwnProperty(listenerId)) {
      this._unsubscribeUnsafe(listenerId);
      return true;
    } else {
      return false;
    }
  }

  protected _unsubscribeUnsafe(listenerId: number): void {
    this.dispatcher.cancel(listenerId);
    delete this.subscriptions[listenerId];
  }

  @autobind
  protected handleTransportMessage(event: IMessageEvent) {
    log.debug('Received message over transport: %s', event.data);
    const data = this.serializer.deserialize(event.data);
    return this.handleMessage(data);
  }

  protected handleMessage(data: object) {
    this.dispatcher.dispatch(data);
  }

  @autobind
  protected handleTransportConnect() {
    log.debug('Initial API connection over transport %s', this.transport.constructor.name);
    this.queue.processQueue();
  }

  @autobind
  protected handleTransportReconnect() {
    log.debug('Reestablished API connection');
    this.resubscribe();
    this.queue.processQueue();
  }

  public buildMultiplexedMessage(stream: string, payload: object): object {
    return {stream, payload};
  }

  public buildRequestResponseSelector(stream: string, requestId: string): object {
    return {
      stream,
      payload: {request_id: requestId},
    };
  }

  public buildSubscribeCreateSelector(stream: string, requestId: string): object {
    return {
      stream,
      payload: {
        action: 'create',
        request_id: requestId,
      },
    };
  }

  public buildSubscribeUpdateSelector(stream: string, requestId: string): object {
    return {
      stream,
      payload: {
        action: 'update',
        request_id: requestId,
      },
    };
  }

  public buildSubscribeDeleteSelector(stream: string, requestId: string): object {
    return {
      stream,
      payload: {
        action: 'delete',
        request_id: requestId,
      },
    };
  }

  public buildSubscribePayload(action: string, args: object, requestId: string): object {
    return {
      action,
      request_id: requestId,
      ...args,
    };
  }

  public buildUnsubscribePayload(action: string, args: object, requestId: string): object {
    return {
      action,
      request_id: requestId,
      ...args,
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

      if (action === 'delete'
          && this.ensurePkFieldInDeleteEvents
          && !data.hasOwnProperty(this.pkField)
      ) {
        // Ensure our configured pkField is used to house primary key
        data[this.pkField] = data.pk;
        // And clear out `pk`
        delete data.pk;
      }

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
