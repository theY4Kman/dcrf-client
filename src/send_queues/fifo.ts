import autobind from 'autobind-decorator';

import { getLogger } from '../logging';
import { ISendQueue } from '../interface';
import BaseSendQueue from './base';

const log = getLogger('dcrf.send_queues.fifo');


export
class FifoQueue extends BaseSendQueue implements ISendQueue {
  public readonly queue: string[];

  constructor(sendNow?: (bytes: string) => number, canSend?: () => boolean) {
    super(sendNow, canSend);
    this.queue = [];
  }

  @autobind
  public send(bytes: string): number {
    if (this.canSend()) {
      log.debug(`Sending bytes over the wire: ${bytes}`);
      return this.sendNow(bytes);
    } else {
      this.queueMessage(bytes);
      return -1;
    }
  }

  public queueMessage(bytes: string): boolean {
    log.debug('Queueing message to send later: %o', bytes);
    this.queue.push(bytes);
    return true;
  }

  @autobind
  public processQueue(): number {
    let numProcessed = 0;

    if (this.queue.length) {
      log.debug(`Sending ${this.queue.length} queued messages.`);

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
