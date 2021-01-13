/**
 * Promise representing the response to subscription, and offering an additional
 * cancel() method to stop listening for updates.
 *
 * This is returned from DCRFClient.subscribe.
 */
export
class SubscriptionPromise<T> extends Promise<T> {
  protected unsubscribe: () => Promise<boolean>;

  constructor(executor: (resolve: (value?: (PromiseLike<T> | T)) => void, reject: (reason?: any) => void) => void,
                unsubscribe: () => Promise<boolean>) {
    super(executor);
    this.unsubscribe = unsubscribe;
  }

  /**
   * Stop listening for new events on this subscription
   * @return true if the subscription was active, false if it was already unsubscribed
   */
  public async cancel(): Promise<boolean> {
    return await this.unsubscribe();
  }
}
