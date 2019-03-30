export
interface IMessageEvent {
  data: string
}

export
type DispatchListener<T> = (response: T) => any;

export
type SubscriptionHandler = (payload: {[prop: string]: any}, action: string) => any;


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
  cancel(): boolean;
}


export type CancelablePromise<T> = ICancelable & Promise<T>;


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
   * Retrieve list of objects from stream
   *
   * @param stream Name of object's type stream
   * @param data Extra data to send to API
   * @param requestId Optional value in the payload to send as request_id to the server.
   *                  If not specified, one will be generated.
   * @return Promise resolves/rejects when response to list request received.
   *         On success, the promise will be resolved with list of objects.
   *         On failure, the promise will be rejected with the entire API response.
   */
  list(stream: string, data?: object, requestId?: string): Promise<object>;

  /**
   * Create a new object
   *
   * @param stream Name of object's type stream
   * @param props Attributes to create on object
   * @param requestId Optional value in the payload to send as request_id to the server.
   *                  If not specified, one will be generated.
   * @return Promise resolves/rejects when response to creation request received.
   *         On success, the promise will be resolved with the created object.
   *         On failure, the promise will be rejected with the entire API response.
   */
  create(stream: string, props: object, requestId?: string): Promise<object>;

  /**
   * Retrieve an existing object
   *
   * @param stream Name of object's type stream
   * @param pk ID of object to retrieve
   * @param data Extra data to send to API
   * @param requestId Optional value in the payload to send as request_id to the server.
   *                  If not specified, one will be generated.
   * @return Promise resolves/rejects when response to retrieval request received.
   *         On success, the promise will be resolved with the retrieved object.
   *         On failure, the promise will be rejected with the entire API response.
   */
  retrieve(stream: string, pk: number, data?: object, requestId?: string): Promise<object>;

  /**
   * Overwrite an existing object
   *
   * @param stream Name of object's type stream
   * @param pk ID of object to update
   * @param props Attributes to patch on object
   * @param requestId Optional value in the payload to send as request_id to the server.
   *                  If not specified, one will be generated.
   * @return Promise resolves/rejects when response to update request received.
   *         On success, the promise will be resolved with the updated object.
   *         On failure, the promise will be rejected with the entire API response.
   */
  update(stream: string, pk: number, props: object, requestId?: string): Promise<object>;

  /**
   * Partially update an existing object
   *
   * @param stream Name of object's type stream
   * @param pk ID of object to update
   * @param props Attributes to patch on object
   * @param requestId Optional value in the payload to send as request_id to the server.
   *                  If not specified, one will be generated.
   * @return Promise resolves/rejects when response to update request received.
   *         On success, the promise will be resolved with the updated object.
   *         On failure, the promise will be rejected with the entire API response.
   */
  patch(stream: string, pk: number, props: object, requestId?: string): Promise<object>;

  /**
   * Delete an existing object
   *
   * @param stream Name of object's type stream
   * @param pk ID of object to delete
   * @param data Extra data to send to API
   * @param requestId Optional value in the payload to send as request_id to the server.
   *                  If not specified, one will be generated.
   * @return Promise resolves/rejects when response to deletion request received.
   *         On success, the promise will be resolved with null, or an empty object.
   *         On failure, the promise will be rejected with the entire API response.
   */
  delete(stream: string, pk: number, data?: object, requestId?: string): Promise<object | null>;

  /**
   * Subscribe to updates
   *
   * @param stream Name of object's type stream
   * @param pk ID of specific DB object to watch.
   * @param callback Function to call with payload on new events
   * @param requestId Optional value in the payload to send as request_id to the server.
   *                  If not specified, one will be generated.
   * @return Promise resolves/rejects when response to subscription request received.
   *         On success, the promise will be resolved with null, or an empty object.
   *         On failure, the promise will be rejected with the entire API response.
   *         This Promise has an additional method, cancel(), which can be called
   *         to cancel the subscription.
   */
  subscribe(stream: string,
            pk: number | SubscriptionHandler | null,
            callback: SubscriptionHandler,
            requestId?: string,
  ): CancelablePromise<object | null>;

  /**
   * Perform an asynchronous transaction
   *
   * @param stream Name of object's type stream
   * @param payload Data to send as payload
   * @param requestId Value to send as request_id to the server. If not
   *                  specified, one will be generated.
   * @return Promise resolves/rejects when response received.
   *         On success, the promise will be resolved with response.data.
   *         On failure, the promise will be rejected with the entire API response.
   */
  request(stream: string, payload: object, requestId?: string): Promise<object>;
}


/**
 * Callback which may mutate the payload before being sent to the server. A new
 * object may be returned, which will be sent instead.
 *
 * @param stream Name of object's type stream
 * @param payload Data which will be sent as payload. This may be mutated, as
 *                long as no value is then returned from the callback.
 * @param requestId Value in the payload sent as request_id to the server.
 * @return undefined to send the same payload object as passed in; or a new
 *         Object to be sent instead.
 *
 */
export type PayloadPreprocessor = (stream: string, payload: object, requestId: string) => object | null;


/**
 * Callback which may mutate the multiplexed message (which includes the stream
 * and payload) before being sent over the wire.
 *
 * @param message The message to be sent over the wire to the server.
 * @return undefined to send the same message object as passed in (and
 *         potentially mutated); or an Object to be sent instead.
 */
export type MessagePreprocessor = (message: object) => object | undefined;


export
interface IDCRFOptions {
  dispatcher?: IDispatcher,
  transport?: ITransport,
  queue?: ISendQueue,
  serializer?: ISerializer,

  preprocessPayload?: PayloadPreprocessor,
  preprocessMessage?: MessagePreprocessor,

  // ReconnectingWebsocket options
  websocket?: {
    maxReconnectionDelay?: number,
    minReconnectionDelay?: number,
    reconnectionDelayGrowFactor?: number,
    connectionTimeout?: number,
    maxRetries?: number,
    debug?: boolean,
  }
}
