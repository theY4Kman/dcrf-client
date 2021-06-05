import isMatch from 'lodash.ismatch';
import pull from 'lodash.pull';

import { getLogger } from '../logging';
import {DispatchListener, IDispatcher} from '../interface';

const log = getLogger('dcrf.dispatchers.fifo');


type Listener<S, P extends S> = {
  selector: S,
  handler: DispatchListener<P>,
};


/**
 * Invokes listeners on a first-registered, first-called basis
 */
export
class FifoDispatcher implements IDispatcher {
  private static listenerCounter: number = 0;

  protected listeners: {
    [listenerId:number]: Listener<any, any>,
  };
  protected listenersOrder: number[];

  constructor() {
    this.listeners = {};
    this.listenersOrder = [];
  }

  public listen<S, P extends S>(selector: S, handler: DispatchListener<P>): number {
    const listenerId = ++FifoDispatcher.listenerCounter;

    this.listeners[listenerId] = {selector, handler};
    this.listenersOrder.push(listenerId);

    return listenerId;
  }

  public once<S, P extends S>(selector: S, handler: DispatchListener<P>): number {
    const listenerId = this.listen(selector, (payload: P) => {
      this.cancel(listenerId);
      handler(payload);
    });
    return listenerId;
  }

  public cancel(listenerId: number): boolean {
    if (!this.listeners.hasOwnProperty(listenerId)) {
      return false;
    }

    delete this.listeners[listenerId];
    pull(this.listenersOrder, listenerId);
    return true
  }

  public dispatch(payload: object): number {
    const listeners = this.listenersOrder.map(listenerId => this.listeners[listenerId]);

    let matches = 0;
    listeners.forEach(({selector, handler}) => {
      if (isMatch(payload, selector)) {
        log.debug('Matched selector %o with payload %o. Invoking handler %s',
                  selector, payload, handler.name);
        matches++;
        handler(payload);
      } else {
        log.silly('Unable to match selector %o with payload %o. Not invoking handler %s',
                  selector, payload, handler.name);
      }
    });

    return matches;
  }
}

export default FifoDispatcher;
