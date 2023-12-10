import autobind from "autobind-decorator";
import uniqBy from "lodash.uniqby";

import { getLogger } from "./logging";
import FifoDispatcher from "./dispatchers/fifo";

import {
  DispatchListener,
  IDCRFOptions,
  IDispatcher,
  IMessageEvent,
  ISendQueue,
  ISerializer,
  IStreamingAPI,
  ITransport,
  StreamingRequestHandler,
  SubscribeOptions,
  SubscriptionHandler,
} from "./interface";

import UUID from "./lib/UUID";
import FifoQueue from "./send_queues/fifo";
import JSONSerializer from "./serializers/json";

import { SubscriptionPromise } from "./subscriptions";
import WebsocketTransport from "./transports/websocket";
import { Logger } from "winston";

const log = getLogger("dcrf");

interface ISubscriptionDescriptor<S, P extends S> {
  selector: S;
  handler: DispatchListener<P>;
  subscribeMessage: object;
  unsubscribeMessage: object;
}

/**
 * Promise representing the listening for responses during a streaming request, and offering an
 * cancel() method to stop listening for additional responses.
 *
 * This is returned from DCRFClient.streamingRequest.
 */
export class StreamingRequestPromise<T> extends Promise<T> {
  protected _dispatcher: IDispatcher;
  protected _listenerId: number | null;

  constructor(
    executor: (
      resolve: (value: PromiseLike<T> | T) => void,
      reject: (reason?: any) => void
    ) => void,
    dispatcher: IDispatcher,
    listenerId: number
  ) {
    super(executor);
    this._dispatcher = dispatcher;
    this._listenerId = listenerId;
  }

  public get listenerId() {
    return this._listenerId;
  }

  /**
   * Stop listening for new events on this subscription
   * @return true if the subscription was active, false if it was already unsubscribed
   */
  public async cancel(): Promise<boolean> {
    if (this._listenerId !== null) {
      const returnValue = this._dispatcher.cancel(this._listenerId);
      this._listenerId = null;
      return returnValue;
    }
    return false;
  }
}

export class DCRFClient implements IStreamingAPI {
  public readonly dispatcher: IDispatcher;
  public readonly transport: ITransport;
  public readonly queue: ISendQueue;
  public readonly serializer: ISerializer;
  public readonly options: IDCRFOptions;
  public readonly pkField: string;
  public readonly ensurePkFieldInDeleteEvents: boolean;
  public readonly logger: Logger;

  public readonly subscriptions: {
    [listenerId: number]: ISubscriptionDescriptor<any, any>;
  };

  /**
   * @param dispatcher Dispatcher instance to route incoming frames to associated handlers
   * @param transport Transport to send and receive messages over the wire.
   * @param queue Instance of Queue to queue messages when transport unavailable.
   * @param serializer Instance which handles serializing data to be sent, and
   *                   deserializing received data.
   * @param options Configuration to customize how DCRFClient operates. See
   *                the IDCRFOptions type for more information.
   */
  constructor(
    dispatcher: IDispatcher,
    transport: ITransport,
    queue: ISendQueue,
    serializer: ISerializer,
    options: IDCRFOptions = {}
  ) {
    this.dispatcher = dispatcher;
    this.transport = transport;
    this.queue = queue;
    this.serializer = serializer;
    this.options = options;

    this.pkField = options.pkField ?? "pk";
    this.ensurePkFieldInDeleteEvents =
      options.ensurePkFieldInDeleteEvents ?? true;
    this.logger = options.logger ?? log;

    if (this.options.buildMultiplexedMessage)
      this.buildMultiplexedMessage =
        this.options.buildMultiplexedMessage.bind(this);
    if (this.options.buildRequestResponseSelector)
      this.buildRequestResponseSelector =
        this.options.buildRequestResponseSelector.bind(this);
    if (this.options.buildSubscribeCreateSelector)
      this.buildSubscribeCreateSelector =
        this.options.buildSubscribeCreateSelector.bind(this);
    if (this.options.buildSubscribeUpdateSelector)
      this.buildSubscribeUpdateSelector =
        this.options.buildSubscribeUpdateSelector.bind(this);
    if (this.options.buildSubscribeDeleteSelector)
      this.buildSubscribeDeleteSelector =
        this.options.buildSubscribeDeleteSelector.bind(this);
    if (this.options.buildSubscribePayload)
      this.buildSubscribePayload =
        this.options.buildSubscribePayload.bind(this);
    if (this.options.buildUnsubscribePayload)
      this.buildUnsubscribePayload =
        this.options.buildUnsubscribePayload.bind(this);

    this.queue.initialize(this.transport.send, this.transport.isConnected);
    this.subscriptions = {};
  }

  public initialize() {
    this.transport.connect();
    this.transport.on("message", this.handleTransportMessage);
    this.transport.on("connect", this.handleTransportConnect);
    this.transport.on("reconnect", this.handleTransportReconnect);
  }

  public close(unsubscribe: boolean = true): Promise<any> {
    let promise: Promise<any>;

    if (unsubscribe) {
      promise = this.unsubscribeAll();
    } else {
      promise = Promise.resolve();
    }

    return promise.then(() => {
      this.transport.disconnect();
    });
  }

  public list(
    stream: string,
    data: object = {},
    requestId?: string
  ): Promise<any> {
    return this.request(
      stream,
      {
        action: "list",
        data,
      },
      requestId
    );
  }

  public create(
    stream: string,
    props: object,
    requestId?: string
  ): Promise<any> {
    return this.request(
      stream,
      {
        action: "create",
        data: props,
      },
      requestId
    );
  }

  public retrieve(
    stream: string,
    pk: number,
    data: object = {},
    requestId?: string
  ): Promise<any> {
    return this.request(
      stream,
      {
        action: "retrieve",
        pk,
        data,
      },
      requestId
    );
  }

  public update(
    stream: string,
    pk: number,
    props: object,
    requestId?: string
  ): Promise<any> {
    return this.request(
      stream,
      {
        action: "update",
        pk,
        data: props,
      },
      requestId
    );
  }

  public patch(
    stream: string,
    pk: number,
    props: object,
    requestId?: string
  ): Promise<any> {
    return this.request(
      stream,
      {
        action: "patch",
        pk,
        data: props,
      },
      requestId
    );
  }

  public delete(
    stream: string,
    pk: number,
    data: object = {},
    requestId?: string
  ): Promise<any> {
    return this.request(
      stream,
      {
        action: "delete",
        pk,
        data,
      },
      requestId
    );
  }

  // Overloads
  public subscribe(
    stream: string,
    pk: number,
    callback: SubscriptionHandler,
    options?: SubscribeOptions
  ): SubscriptionPromise<object>;
  public subscribe(
    stream: string,
    pk: number,
    callback: SubscriptionHandler,
    requestId?: string
  ): SubscriptionPromise<object>;
  public subscribe(
    stream: string,
    args: object,
    callback: SubscriptionHandler,
    options?: SubscribeOptions
  ): SubscriptionPromise<object>;
  public subscribe(
    stream: string,
    args: object,
    callback: SubscriptionHandler,
    requestId?: string
  ): SubscriptionPromise<object>;

  public subscribe(
    stream: string,
    args: object | number,
    callback: SubscriptionHandler,
    options?: SubscribeOptions | string
  ): SubscriptionPromise<object> {
    if (callback == null) {
      throw new Error("callback must be provided");
    }

    if (typeof options === "string") {
      options = {
        requestId: options,
      };
    }

    options = options ?? {};
    options.includeCreateEvents = options.includeCreateEvents ?? false;
    options.includeDeleteEvents = options.includeDeleteEvents ?? true;
    options.requestId = options.requestId ?? UUID.generate();
    options.subscribeAction = options.subscribeAction ?? "subscribe_instance";
    options.unsubscribeAction =
      options.unsubscribeAction ?? "unsubscribe_instance";

    if (args !== null && typeof args !== "object") {
      const pk = args;
      args = {
        [options.subscribeAction === "subscribe_instance"
          ? "pk"
          : this.pkField]: pk,
      };
    }

    const requestId = options.requestId;

    const updateSelector = this.buildSubscribeUpdateSelector(stream, requestId);
    
    const handler: (
      data: typeof updateSelector & { payload: { data: any; action: string } }
    ) => void = this.buildSubscribeListener(callback);
    const subscribePayload = this.buildSubscribePayload(
      options.subscribeAction,
      args as object,
      requestId
    );
    const unsubscribePayload = this.buildUnsubscribePayload(
      options.unsubscribeAction,
      args as object,
      requestId
    );

    const subscribeMessage = this.buildMultiplexedMessage(
      stream,
      subscribePayload
    );
    const unsubscribeMessage = this.buildMultiplexedMessage(
      stream,
      unsubscribePayload
    );

    const listenerIds: number[] = [];
    const addListener = (selector: object) => {
      const listenerId = this.dispatcher.listen(selector, handler);
      listenerIds.push(listenerId);
      this.subscriptions[listenerId] = {
        selector,
        handler,
        subscribeMessage,
        unsubscribeMessage,
      };
    };

    addListener(updateSelector);

    if (options.includeDeleteEvents) {
      const deleteSelector = this.buildSubscribeDeleteSelector(stream, requestId);
      addListener(deleteSelector);
    }

    if (options.includeCreateEvents) {
      const createSelector = this.buildSubscribeCreateSelector(stream, requestId);
      addListener(createSelector);
    }

    const requestPromise = this.request(stream, subscribePayload, requestId);
    const unsubscribe = async () => {
      const wasSubbed = listenerIds.map(this.unsubscribe).some(Boolean);
      await this.request(stream, unsubscribePayload, requestId);
      return wasSubbed;
    };

    return new SubscriptionPromise((resolve, reject) => {
      requestPromise.then(resolve, reject);
    }, unsubscribe);
  }

  public unsubscribeAll(): Promise<number> {
    const subscriptions: Array<ISubscriptionDescriptor<any, any>> =
      Object.values(this.subscriptions);
    const unsubscribeMessages = uniqBy(subscriptions, (s) => {
      // @ts-ignore
      return s.unsubscribeMessage?.payload?.request_id;
    });

    const listenerIds = Object.keys(this.subscriptions).map(parseInt);
    this.logger.info("Removing %d listeners", listenerIds.length);
    listenerIds.forEach((listenerId) => this._unsubscribeUnsafe(listenerId));

    this.logger.info(
      "Sending %d unsubscription requests",
      unsubscribeMessages.length
    );
    const unsubscriptionPromises = [];
    for (const { unsubscribeMessage } of unsubscribeMessages) {
      const {
        stream,
        payload: { request_id, ...payload },
      }: any = unsubscribeMessage;
      unsubscriptionPromises.push(
        this.request(stream, payload, request_id).catch(() => {})
      );
    }
    return Promise.all(unsubscriptionPromises).then(() => listenerIds.length);
  }

  /**
   * Send subscription requests for all registered subscriptions
   */
  public resubscribe() {
    const subscriptions: Array<ISubscriptionDescriptor<any, any>> =
      Object.values(this.subscriptions);
    const resubscribeMessages = uniqBy(subscriptions, (s) => {
      // @ts-ignore
      return s.subscribeMessage?.payload?.request_id;
    });

    this.logger.info(
      "Resending %d subscription requests",
      subscriptions.length
    );

    for (const { subscribeMessage } of resubscribeMessages) {
      this.sendNow(subscribeMessage);
    }
  }

  private sendRequest(payload: object, requestId: string, stream: string) {
    payload = Object.assign({}, payload, { request_id: requestId });
    if (this.options.preprocessPayload != null) {
      // Note: this and the preprocessMessage handler below presume an object will be returned.
      //       If you really want to return a 0, you're kinda SOL -- wrap it in an object :P
      payload =
        this.options.preprocessPayload(stream, payload, requestId) || payload;
    }

    let message = this.buildMultiplexedMessage(stream, payload);
    if (this.options.preprocessMessage != null) {
      message = this.options.preprocessMessage(message) || message;
    }

    this.send(message);
  }

  public request(
    stream: string,
    payload: object,
    requestId: string = UUID.generate()
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const selector = this.buildRequestResponseSelector(stream, requestId);

      this.dispatcher.once(
        selector,
        (
          data: typeof selector & {
            payload: { response_status: number; data: any };
          }
        ) => {
          const { payload: response } = data;
          const responseStatus = response.response_status;

          // 2xx is success
          if (Math.floor(responseStatus / 100) === 2) {
            resolve(response.data);
          } else {
            reject(response);
          }
        }
      );
      this.sendRequest(payload, requestId, stream);
    });
  }

  public streamingRequest(
    stream: string,
    payload: object,
    callback: StreamingRequestHandler,
    requestId: string = UUID.generate()
  ): StreamingRequestPromise<void> {
    const selector = this.buildRequestResponseSelector(stream, requestId);

    let cancelable: StreamingRequestPromise<void>;
    let listenerId: number | null = this.dispatcher.listen(
      selector,
      (
        data: typeof selector & {
          payload: { response_status: number; data: any };
        }
      ) => {
        const { payload: response } = data;
        const responseStatus = response.response_status;

        if (!cancelable.listenerId) {
          // we promise not to call callback after cancel.
          return;
        }

        // 2xx is success
        if (Math.floor(responseStatus / 100) === 2) {
          callback(null, response.data);
        } else {
          cancelable.cancel().finally(() => {
            callback(response, null);
          });
        }
      }
    );

    cancelable = new StreamingRequestPromise(
      (resolve, reject) => {
        try {
          this.sendRequest(payload, requestId, stream);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      this.dispatcher,
      listenerId
    );

    return cancelable;
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

  @autobind
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
    this.logger.debug("Received message over transport: %s", event.data);
    const data = this.serializer.deserialize(event.data);
    return this.handleMessage(data);
  }

  protected handleMessage(data: object) {
    this.dispatcher.dispatch(data);
  }

  @autobind
  protected handleTransportConnect() {
    this.logger.debug(
      "Initial API connection over transport %s",
      this.transport.constructor.name
    );
    this.queue.processQueue();
  }

  @autobind
  protected handleTransportReconnect() {
    this.logger.debug("Reestablished API connection");
    this.resubscribe();
    this.queue.processQueue();
  }

  public buildMultiplexedMessage(stream: string, payload: object): object {
    return { stream, payload };
  }

  public buildRequestResponseSelector(
    stream: string,
    requestId: string
  ): object {
    return {
      stream,
      payload: { request_id: requestId },
    };
  }

  public buildSubscribeCreateSelector(
    stream: string,
    requestId: string
  ): object {
    return {
      stream,
      payload: {
        action: "create",
        request_id: requestId,
      },
    };
  }

  public buildSubscribeUpdateSelector(
    stream: string,
    requestId: string
  ): object {
    return {
      stream,
      payload: {
        action: "update",
        request_id: requestId,
      },
    };
  }

  public buildSubscribeDeleteSelector(
    stream: string,
    requestId: string
  ): object {
    return {
      stream,
      payload: {
        action: "delete",
        request_id: requestId,
      },
    };
  }

  public buildSubscribePayload(
    action: string,
    args: object,
    requestId: string
  ): object {
    return {
      action,
      request_id: requestId,
      ...args,
    };
  }

  public buildUnsubscribePayload(
    action: string,
    args: object,
    requestId: string
  ): object {
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
    callback: (
      data: { [prop: string]: any },
      response: { [prop: string]: any }
    ) => void
  ): DispatchListener<{ payload: { data: any } }> {
    return (data: { payload: { data: any } }) => {
      return callback(data.payload.data, data);
    };
  }

  /**
   * Build a function which will take an entire JSON message and return only
   * the relevant payload (usually an object).
   */
  protected buildSubscribeListener(
    callback: (data: object, action: string) => void
  ): DispatchListener<{ payload: { data: any; action: string } }> {
    return this.buildListener((data, response) => {
      const action = response.payload.action;

      if (
        action === "delete" &&
        this.ensurePkFieldInDeleteEvents &&
        !data.hasOwnProperty(this.pkField)
      ) {
        // Ensure our configured pkField is used to house primary key
        data[this.pkField] = data.pk;
        // And clear out `pk`
        delete data.pk;
      }

      return callback(data, action);
    });
  }
}

export default {
  /**
   * Configure a DCRFClient client and begin connection
   *
   * @param url WebSocket URL to connect to
   * @param options Configuration for DCRFClient and ReconnectingWebsocket
   */
  connect(url: string, options: IDCRFOptions = {}): DCRFClient {
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
  createClient(url: string, options: IDCRFOptions = {}): DCRFClient {
    const dispatcher: IDispatcher =
      options.dispatcher || new FifoDispatcher(options.logger);
    const transport: ITransport =
      options.transport ||
      new WebsocketTransport(url, options.websocket, options.logger);
    const queue: ISendQueue =
      options.queue || new FifoQueue({ logger: options.logger });
    const serializer: ISerializer = options.serializer || new JSONSerializer();
    return new DCRFClient(dispatcher, transport, queue, serializer, options);
  },
};
