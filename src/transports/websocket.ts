import {getLogger} from 'loglevel';
import {EventEmitter} from 'events';
import ReconnectingWebsocket, { Event } from 'reconnecting-websocket';
import autobind from 'autobind-decorator';

import {ITransport} from '../interface';


const log = getLogger('dcrf.transports.websocket');


/**
 * Transport backed by a reconnecting websocket
 */
export
class WebsocketTransport extends EventEmitter implements ITransport {
  public readonly url: string;
  public readonly options: object;
  public socket: ReconnectingWebsocket | null;
  public hasConnected: boolean;

  /**
   *
   * @param url Websocket URL to connect to
   * @param options Options to pass to ReconnectingWebsocket
   */
  constructor(url: string, options: object={}) {
    super();
    this.url = url;
    this.options = options;
    this.socket = null;
    this.hasConnected = false;
  }

  @autobind
  public connect() {
    if (this.socket != null) {
      log.debug('Attempt to connect already-connected socket ignored (%s)', this.url);
      return false;
    }

    log.info('Connecting to websocket at %s', this.url);
    this.socket = new ReconnectingWebsocket(this.url, [], this.options);

    this.socket.addEventListener('message', this.handleMessage);
    this.socket.addEventListener('open', this.handleOpen);

    return true;
  }

  @autobind
  public disconnect(): boolean {
    if (this.socket == null) {
      return false;
    }

    this.socket.close();
    return true;
  }

  @autobind
  public isConnected() {
    if (this.socket == null) {
      return false;
    } else {
      return this.socket.readyState === this.socket.OPEN;
    }
  }

  @autobind
  public send(bytes: string): void {
    if (this.socket === null) {
      throw new Error('Socket not connected. Please call `initialize()` first.');
    }
    this.socket.send(bytes);
  }

  @autobind
  protected handleMessage(event: Event) {
    this.emit('message', event);
  }

  @autobind
  protected handleOpen(event: Event) {
    this.emit('open', event);

    if (this.hasConnected) {
      this.emit('reconnect', event);
    } else {
      this.emit('connect', event);
      this.hasConnected = true;
    }
  }
}


export default WebsocketTransport;
