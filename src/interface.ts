import { Options as ReconnectingWebsocketOptions } from 'reconnecting-websocket';

export
interface IMessageEvent {
  data: string
}

export
type DispatchListener<T> = (response: T) => any;

export
type SubscriptionHandler = (payload: {[prop: string]: any}, action: string) => any;

export
type RequestMultipleHandler = (error: {response_status: number, data: any} | null, payload: {[prop: string]: any} | null) => any;

export
type RequestMultipleCancel = () => void;

/**
 * Calls all handlers whose selectors match an incoming payload.
 */
export
interface IDispatcher {
  /**
   * Pass any matching incoming messages to a handler
   *
   * @param selector An object to match against incoming JSON message
   * @param handler Callback accepting one argument: the entire JSON decoded
   *                object from the WS message.
   * @return A listener ID to pass to cancel
   */
  listen<S, P extends S>(selector: S, handler: DispatchListener<P>): number;

  /**
   * Register a handler called once when selector is matched, but no more.
   *
   * @param selector An object to match against incoming JSON message
   * @param handler Callback accepting one argument: the entire JSON decoded
   *                object from the WS message.
   * @return A listener ID to pass to cancel
   */
  once<S, P extends S>(selector: S, handler: DispatchListener<P>): number;

  /**
   * Stop passing along messages for a listener
   *
   * @param listenerId An ID returned from listen() or once()
   * @return true if listener was active, false if already deactivated
   */
  cancel(listenerId: number): boolean;

  /**
   * Call handlers of any matching selectors.
   *
   * @param payload JSON payload
   * @return Number of matching selectors whose handlers were called.
   */
  dispatch(payload: object): number;
}


/**
 * If transport available, sends messages immediately. Otherwise, queues
 * messages for sending later.
 */
export
interface ISendQueue {
  /**
   * Initialize the queue
   *
   * @param sendNow Function to call to send a message
   * @param canSend Function which should return whether send can be called
   */
  initialize(sendNow: (bytes: string) => number | void, canSend: () => boolean): void;

  /**
   * Send a message if possible, otherwise queues message.
   *
   * @param bytes Message to send over wire
   * @return Number of bytes successfully sent (if applicable)
   */
  send(bytes: string): number;

  /**
   * Send message immediately, bypassing queue. If send fails, no attempt to
   * resend message is made.
   *
   * @param bytes Message to send over wire
   * @return Number of bytes successfully sent (if applicable)
   */
  sendNow(bytes: string): number;

  /**
   * Queue a message for sending later.
   *
   * @param bytes Message to send eventually over the wire
   * @return Whether the message was successfully added to the queue
   */
  queueMessage(bytes: string): boolean;

  /**
   * Send any queued messages.
   *
   * @return Number of messages resent
   */
  processQueue(): number;
}


export type TransportEvent = 'open' | 'connect' | 'reconnect' | 'message';

export
interface ITransport {
  /**
   * Initiate the transport's connection
   *
   * @return true if the connection is initiated, false if a connection already
   *         exists.
   */
  connect(): boolean;

  /**
   * Close the transport's connection
   *
   * @return true if an already-established connection was closed,
   *         false if no connection had been established in order to close
   */
  disconnect(): boolean;

  /**
   * Whether the transport is ready to send/receive messages
   */
  isConnected(): boolean;

  /**
   * Register a callback for a particular event. The Transport must support
   * the following event types:
   *
   *  - "open": when the connection is opened
   *  - "connect": on initial connection
   *  - "reconnect": when the connection is lost, then reestablished
   *  - "message": when a message is received
   */
  on(name: TransportEvent, handler: (...args: any) => void): any | null;

  /**
   * Send a message over the wire
   * @return Number of bytes sent over the wire (if applicable)
   */
  send(bytes: string): number | void;
}


/**
 * Serialize/deserialize messages to and from the wire
 */
export
interface ISerializer {
  serialize(message: object): string;
  deserialize(bytes: string): any;
}


export
interface ICancelable {
  /**
   * @return true if canceled, false if already canceled.
   */
  cancel(): Promise<boolean>;
}


export type CancelablePromise<T> = ICancelable & Promise<T>;

export type SubscribeOptions = {
  requestId?: string,
  subscribeAction?: string,
  unsubscribeAction?: string,
  includeCreateEvents?: boolean,
}

export type SubscriptionAction = 'create' | 'update' | 'delete';

/**
 * An API client implementing create, retrieve, update, delete, and subscribe
 * for streams of objects.
 */
export
interface IStreamingAPI {
  /**
   * Initialize connection. Must be called before API.
   */
  initialize(): void;

  /**
   * Close the connection.
   *
   * @param unsubscribe Whether to cancel all subscriptions, as well. Defaults to true.
   * @return Promise Resolves when all unsubscription requests have completed, or
   *    immediately if unsubscribe=false
   */
  close(unsubscribe?: boolean): Promise<any>;

  /**
   * The name of the primary key field, used to identify objects for subscriptions.
   *
   * NOTE: this field is used by the default buildSubscribeSelector and buildSubscribePayload
   *       functions. If these are overridden in the DCRFClient options, this pkField value
   *       may not be honoured.
   */
  readonly pkField: string;

  /**
   * Whether to ensure payloads for delete events of subscribed models include
   * the primary key of the object in [pkField].
   *
   * Because payloads for delete events aren't run through the serializer,
   * delete events *always* use `pk` to identify the object. This may differ
   * from update events, which *are* run through the serializer, leading to
   * more complicated logic within subscription handlers to retrieve the primary
   * key either from `id` or `pk`, depending on whether it's update or delete.
   *
   * Since this can be ugly, setting this option to true (by passing it in options
   * when instantiating the client) will ensure the configured [pkField] is always
   * present in delete event payloads.
   */
  readonly ensurePkFieldInDeleteEvents: boolean;

  /**
   * Retrieve list of objects from stream
   *
   * @param stream Name of object's type stream
   * @param data Extra data to send to API
   * @param requestId Optional value in the payload to send as request_id to the server.
   *     If not specified, one will be generated.
   * @return Promise resolves/rejects when response to list request received.
   *     On success, the promise will be resolved with list of objects.
   *     On failure, the promise will be rejected with the entire API response.
   */
  list(stream: string, data?: object, requestId?: string): Promise<object>;

  /**
   * Create a new object
   *
   * @param stream Name of object's type stream
   * @param props Attributes to create on object
   * @param requestId Optional value in the payload to send as request_id to the server.
   *     If not specified, one will be generated.
   * @return Promise resolves/rejects when response to creation request received.
   *     On success, the promise will be resolved with the created object.
   *     On failure, the promise will be rejected with the entire API response.
   */
  create(stream: string, props: object, requestId?: string): Promise<object>;

  /**
   * Retrieve an existing object
   *
   * @param stream Name of object's type stream
   * @param pk ID of object to retrieve
   * @param data Extra data to send to API
   * @param requestId Optional value in the payload to send as request_id to the server.
   *     If not specified, one will be generated.
   * @return Promise resolves/rejects when response to retrieval request received.
   *     On success, the promise will be resolved with the retrieved object.
   *     On failure, the promise will be rejected with the entire API response.
   */
  retrieve(stream: string, pk: number, data?: object, requestId?: string): Promise<object>;

  /**
   * Overwrite an existing object
   *
   * @param stream Name of object's type stream
   * @param pk ID of object to update
   * @param props Attributes to patch on object
   * @param requestId Optional value in the payload to send as request_id to the server.
   *    If not specified, one will be generated.
   * @return Promise resolves/rejects when response to update request received.
   *     On success, the promise will be resolved with the updated object.
   *     On failure, the promise will be rejected with the entire API response.
   */
  update(stream: string, pk: number, props: object, requestId?: string): Promise<object>;

  /**
   * Partially update an existing object
   *
   * @param stream Name of object's type stream
   * @param pk ID of object to update
   * @param props Attributes to patch on object
   * @param requestId Optional value in the payload to send as request_id to the server.
   *    If not specified, one will be generated.
   * @return Promise resolves/rejects when response to update request received.
   *    On success, the promise will be resolved with the updated object.
   *    On failure, the promise will be rejected with the entire API response.
   */
  patch(stream: string, pk: number, props: object, requestId?: string): Promise<object>;

  /**
   * Delete an existing object
   *
   * @param stream Name of object's type stream
   * @param pk ID of object to delete
   * @param data Extra data to send to API
   * @param requestId Optional value in the payload to send as request_id to the server.
   *    If not specified, one will be generated.
   * @return Promise resolves/rejects when response to deletion request received.
   *    On success, the promise will be resolved with null, or an empty object.
   *    On failure, the promise will be rejected with the entire API response.
   */
  delete(stream: string, pk: number, data?: object, requestId?: string): Promise<object | null>;

  /**
   * Subscribe to update and delete events for an object, or perform a custom subscription
   *
   * @param stream Name of object's type stream
   * @param pk ID of specific DB object to watch
   * @param callback Function to call with payload on new events
   * @param options Optional object to configure the subscription
   * @param options.requestId Specific request ID to submit with the
   *    subscription/unsubscription request, and which will be included in
   *    responses from DCRF. If not specified, one will be automatically generated.
   * @param options.subscribeAction Name of action used in subscription request.
   *    By default, 'subscribe_instance' is used.
   * @param options.unsubscribeAction Name of action used in unsubscription request.
   *    By default, 'unsubscribe_instance' is used.
   * @param options.includeCreateEvents Whether to listen for creation events,
   *    in addition to updates and deletes. By default, this is false.
   * @return Promise Resolves/rejects when response to subscription request received.
   *    On success, the promise will be resolved with null, or an empty object.
   *    On failure, the promise will be rejected with the entire API response.
   *    This Promise has an additional method, cancel(), which can be called
   *    to cancel the subscription.
   */
  subscribe(stream: string, pk: number, callback: SubscriptionHandler, options?: SubscribeOptions): CancelablePromise<object | null>;

  /**
   * Subscribe to update and delete events for an object, or perform a custom subscription
   *
   * @param stream Name of object's type stream
   * @param pk ID of specific DB object to watch
   * @param callback Function to call with payload on new events
   * @param requestId Specific request ID to submit with the subscription/unsubscription
   *    request, and which will be included in responses from DCRF.
   *    If not specified, one will be automatically generated.
   * @return Promise Resolves/rejects when response to subscription request received.
   *    On success, the promise will be resolved with null, or an empty object.
   *    On failure, the promise will be rejected with the entire API response.
   *    This Promise has an additional method, cancel(), which can be called
   *    to cancel the subscription.
   */
  subscribe(stream: string, pk: number, callback: SubscriptionHandler, requestId?: string): CancelablePromise<object | null>;

  /**
   * Subscribe to update and delete events for an object, or perform a custom subscription
   *
   * @param stream Name of object's type stream
   * @param args Identifying information to be included in subscription request
   * @param callback Function to call with payload on new events
   * @param options Optional object to configure the subscription
   * @param options.requestId Specific request ID to submit with the
   *    subscription/unsubscription request, and which will be included in
   *    responses from DCRF. If not specified, one will be automatically generated.
   * @param options.subscribeAction Name of action used in subscription request.
   *    By default, 'subscribe_instance' is used.
   * @param options.unsubscribeAction Name of action used in unsubscription request.
   *    By default, 'unsubscribe_instance' is used.
   * @param options.includeCreateEvents Whether to listen for creation events,
   *    in addition to updates and deletes. By default, this is false.
   * @return Promise Resolves/rejects when response to subscription request received.
   *    On success, the promise will be resolved with null, or an empty object.
   *    On failure, the promise will be rejected with the entire API response.
   *    This Promise has an additional method, cancel(), which can be called
   *    to cancel the subscription.
   */
  subscribe(stream: string, args: object, callback: SubscriptionHandler, options?: SubscribeOptions): CancelablePromise<object | null>;

  /**
   * Subscribe to update and delete events for an object, or perform a custom subscription
   *
   * @param stream Name of object's type stream
   * @param args Identifying information to be included in subscription request
   * @param callback Function to call with payload on new events
   * @param requestId Specific request ID to submit with the subscription/unsubscription
   *    request, and which will be included in responses from DCRF.
   *    If not specified, one will be automatically generated.
   * @return Promise Resolves/rejects when response to subscription request received.
   *    On success, the promise will be resolved with null, or an empty object.
   *    On failure, the promise will be rejected with the entire API response.
   *    This Promise has an additional method, cancel(), which can be called
   *    to cancel the subscription.
   */
  subscribe(stream: string, args: object, callback: SubscriptionHandler, requestId?: string): CancelablePromise<object | null>;

  /**
   * Cancel all subscriptions
   *
   * @return Promise resolving when all unsubscription requests have completed,
   *    with a value representing the number of listeners removed.
   */
  unsubscribeAll(): Promise<number>;

  /**
   * Perform an asynchronous transaction
   *
   * @param stream Name of object's type stream
   * @param payload Data to send as payload
   * @param requestId Value to send as request_id to the server. If not specified,
   *    one will be generated.
   * @return Promise resolves/rejects when response received.
   *    On success, the promise will be resolved with response.data.
   *    On failure, the promise will be rejected with the entire API response.
   */
  request(stream: string, payload: object, requestId?: string): Promise<object>;
}


/**
 * Callback which may mutate the payload before being sent to the server. A new
 * object may be returned, which will be sent instead.
 *
 * @param stream Name of object's type stream
 * @param payload Data which will be sent as payload. This may be mutated, as
 *    long as no value is then returned from the callback.
 * @param requestId Value in the payload sent as request_id to the server.
 * @return undefined to send the same payload object as passed in; or a new
 *    Object to be sent instead.
 *
 */
export type PayloadPreprocessor = (stream: string, payload: object, requestId: string) => object | null;


/**
 * Callback which may mutate the multiplexed message (which includes the stream
 * and payload) before being sent over the wire.
 *
 * @param message The message to be sent over the wire to the server.
 * @return undefined to send the same message object as passed in (and
 *    potentially mutated); or an Object to be sent instead.
 */
export type MessagePreprocessor = (message: object) => object | undefined;


/**
 * Function used to format a multiplexed message (i.e. a payload routed to a stream)
 *
 * By default, DCRFClient simply builds an object containing: {stream, payload}
 *
 * @param stream The stream to send the payload to
 * @param payload The data to send to the stream
 */
export type MultiplexedMessageBuilder = (stream: string, payload: object) => object;


/**
 * Function used to generate a selector (a pattern matching an object) for the
 * response to an API request. Responses to API requests are generally identified
 * by stream they belong to, and a request_id returned in the payload.
 *
 * By default, DCRFClient selects on: {stream, payload: {request_id: requestId}}
 *
 * @param stream The stream to expect the API response from
 * @param requestId The ID of the API request to expect a response to
 */
export type RequestResponseSelectorBuilder = (stream: string, requestId: string) => object;

/**
 * Function used to generate a selector (a pattern matching an object) for an
 * create event sent by the server due to a subscription.
 *
 * Note that because payloads for delete events aren't run through the
 * serializer, delete events *always* use `pk` to identify the object. This may
 * differ from create and update events, which *are* run through the serializer,
 * and thus may have different selectors.
 *
 * Subscription messages are generally identified by the stream they belong to and
 * the request_id of the original subscription request.
 *
 * By default, DCRFClient selects on {stream, request_id: requestId}}
 *
 * @param stream The stream to expect the subscription event from
 * @param requestId The request ID used to initiate the subscription
 */
export type SubscribeCreateSelectorBuilder = (stream: string, requestId: string) => object;

/**
 * Function used to generate a selector (a pattern matching an object) for an
 * update event sent by the server due to a subscription.
 *
 * Note that because payloads for delete events aren't run through the
 * serializer, delete events *always* use `pk` to identify the object. This may
 * differ from create and update events, which *are* run through the serializer,
 * and thus may have different selectors.
 *
 * Subscription messages are generally identified by the stream they belong to and
 * the request_id of the original subscription request.
 *
 * By default, DCRFClient selects on {stream, request_id: requestId}}
 *
 * @param stream The stream to expect the subscription event from
 * @param requestId The request ID used to initiate the subscription
 */
export type SubscribeUpdateSelectorBuilder = (stream: string, requestId: string) => object;


/**
 * Function used to generate a selector (a pattern matching an object) for an
 * delete event sent by the server due to a subscription.
 *
 * Note that because payloads for delete events aren't run through the
 * serializer, delete events *always* use `pk` to identify the object. This may
 * differ from create and update events, which *are* run through the serializer,
 * and thus may have different selectors.
 *
 * Subscription messages are generally identified by the stream they belong to and
 * the request_id of the original subscription request.
 *
 * By default, DCRFClient selects on {stream, request_id: requestId}}
 *
 * @param stream The stream to expect the subscription event from
 * @param requestId The request ID used to initiate the subscription
 */
export type SubscribeDeleteSelectorBuilder = (stream: string, requestId: string) => object;


/**
 * Function used to generate the payload for a subscription request.
 *
 * By default, DCRFClient builds {action: 'subscribe_instance', request_id: requestId, pk}
 *
 * @param pk The primary key / ID of the object to subscribe to
 * @param requestId The request ID to use in the subscription request
 */
export type SubscribePayloadBuilder = (action: string, args: object, requestId: string) => object;
export type UnsubscribePayloadBuilder = (action: string, args: object, requestId: string) => object;


export
interface IDCRFOptions {
  dispatcher?: IDispatcher,
  transport?: ITransport,
  queue?: ISendQueue,
  serializer?: ISerializer,

  preprocessPayload?: PayloadPreprocessor,
  preprocessMessage?: MessagePreprocessor,

  pkField?: string,
  ensurePkFieldInDeleteEvents?: boolean,

  buildMultiplexedMessage?: MultiplexedMessageBuilder,
  buildRequestResponseSelector?: RequestResponseSelectorBuilder,
  buildSubscribeCreateSelector?: SubscribeCreateSelectorBuilder,
  buildSubscribeUpdateSelector?: SubscribeUpdateSelectorBuilder,
  buildSubscribeDeleteSelector?: SubscribeDeleteSelectorBuilder,
  buildSubscribePayload?: SubscribePayloadBuilder,
  buildUnsubscribePayload?: UnsubscribePayloadBuilder,

  // ReconnectingWebsocket options
  websocket?: ReconnectingWebsocketOptions
}
