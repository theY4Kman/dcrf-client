import {ISendQueue} from '../interface';


export
class BaseSendQueue implements ISendQueue {
  /**
   * @param sendNow Function to call to send a message
   * @param canSend Function which should return whether send can be called
   * @note If parameters are not passed, initialize() should be called later.
   */
  constructor(sendNow?: (_bytes: string) => number, canSend?: () => boolean) {
    if (sendNow && canSend) {
      this.initialize(sendNow, canSend);
    } else if (sendNow || canSend) {
      throw new Error('Both sendNow and canSend must be provided, or neither must.');
    }
  }
  public sendNow: (_bytes: string) => number = (_bytes) => -1;
  public canSend: () => boolean = () => false;

  /**
   * @param sendNow Function to call to send a message
   * @param canSend Function which should return whether send can be called
   */
  public initialize(sendNow: (_bytes: string) => number, canSend: () => boolean) {
    this.sendNow = sendNow;
    this.canSend = canSend;
  }

  public send(_bytes: string): number {
    throw new Error('not implemented');
  }

  public queueMessage(_bytes: string): boolean {
    throw new Error('not implemented');
  }
  public processQueue(): number {
    throw new Error('not implemented');
  }
}

export default BaseSendQueue;
