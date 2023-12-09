import autobind from "autobind-decorator";

import { getLogger } from "../logging";
import { ISendQueue } from "../interface";
import BaseSendQueue from "./base";
import { Logger } from "winston";

const defaultLogger = getLogger("dcrf.send_queues.fifo");

export class FifoQueue extends BaseSendQueue implements ISendQueue {
  public readonly queue: string[];
  private readonly logger: Logger;

  constructor({
    sendNow,
    canSend,
    logger,
  }: {
    sendNow?: (bytes: string) => number;
    canSend?: () => boolean;
    logger?: Logger;
  } = {}) {
    super(sendNow, canSend);
    this.queue = [];
    this.logger = logger || defaultLogger;
  }

  @autobind
  public send(bytes: string): number {
    if (this.canSend()) {
      this.logger.debug(`Sending bytes over the wire: ${bytes}`);
      return this.sendNow(bytes);
    } else {
      this.queueMessage(bytes);
      return -1;
    }
  }

  public queueMessage(bytes: string): boolean {
    this.logger.debug("Queueing message to send later: %o", bytes);
    this.queue.push(bytes);
    return true;
  }

  @autobind
  public processQueue(): number {
    let numProcessed = 0;

    if (this.queue.length) {
      this.logger.debug(`Sending ${this.queue.length} queued messages.`);

      while (this.queue.length) {
        const object = this.queue.shift();
        if (object !== undefined) {
          this.sendNow(object);
        }
        numProcessed++;
      }
    }

    return numProcessed;
  }
}

export default FifoQueue;
