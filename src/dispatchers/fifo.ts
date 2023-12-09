import isMatch from "lodash.ismatch";
import pull from "lodash.pull";

import { getLogger } from "../logging";
import { DispatchListener, IDispatcher } from "../interface";
import { Logger } from "winston";

const defaultLogger = getLogger("dcrf.dispatchers.fifo");

type Listener<S, P extends S> = {
  selector: S;
  handler: DispatchListener<P>;
};

/**
 * Invokes listeners on a first-registered, first-called basis
 */
export class FifoDispatcher implements IDispatcher {
  private static listenerCounter: number = 0;

  protected listeners: {
    [listenerId: number]: Listener<any, any>;
  };
  protected listenersOrder: number[];
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.listeners = {};
    this.listenersOrder = [];
    this.logger = logger || defaultLogger;
  }

  public listen<S, P extends S>(
    selector: S,
    handler: DispatchListener<P>
  ): number {
    const listenerId = ++FifoDispatcher.listenerCounter;

    this.listeners[listenerId] = { selector, handler };
    this.listenersOrder.push(listenerId);

    return listenerId;
  }

  public once<S, P extends S>(
    selector: S,
    handler: DispatchListener<P>
  ): number {
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
    return true;
  }

  public dispatch(payload: object): number {
    const listeners = this.listenersOrder.map(
      (listenerId) => this.listeners[listenerId]
    );

    let matches = 0;
    listeners.forEach(({ selector, handler }) => {
      if (isMatch(payload, selector)) {
        this.logger.debug(
          "Matched selector %o with payload %o. Invoking handler %s",
          selector,
          payload,
          handler.name
        );
        matches++;
        handler(payload);
      } else {
        this.logger.silly(
          "Unable to match selector %o with payload %o. Not invoking handler %s",
          selector,
          payload,
          handler.name
        );
      }
    });

    return matches;
  }
}

export default FifoDispatcher;
