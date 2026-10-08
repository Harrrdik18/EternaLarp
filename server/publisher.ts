/** Platform publishing boundary. Real OAuth clients implement the same contract. */
export type PublishRequest = { organizationId: string; accountId: string; idempotencyKey: string; text: string; mediaUrls: string[]; scheduledAt: Date }
export type PublishResult = { externalId: string; permalink: string; publishedAt: Date; metrics: { impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; clicks: number } }
export type RetryClass = 'transient' | 'rate_limit' | 'expired_token' | 'permanent'
export class PublishError extends Error { constructor(message: string, readonly kind: RetryClass, readonly retryAfterMs?: number) { super(message) } }
export interface SocialPublisher { readonly platform: string; publish(request: PublishRequest): Promise<PublishResult> }
export class PublisherRegistry {
  private readonly adapters = new Map<string, SocialPublisher>()
  register(adapter: SocialPublisher) { this.adapters.set(adapter.platform, adapter) }
  forPlatform(platform: string) { const adapter = this.adapters.get(platform); if (!adapter) throw new PublishError(`No publisher configured for ${platform}`, 'permanent'); return adapter }
}
/** Predictable provider used by local development; never reaches a social network. */
export class MockPublisher implements SocialPublisher {
  constructor(readonly platform: string) {}
  async publish(request: PublishRequest): Promise<PublishResult> {
    // A stable id makes retrying the same request idempotent in local previews.
    const externalId = `mock_${request.idempotencyKey.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`
    return { externalId, permalink: `https://mock.signal.test/${this.platform}/${externalId}`, publishedAt: new Date(), metrics: { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0 } }
  }
}
export type QueueJob = { scheduledPostId: string; organizationId: string; idempotencyKey: string; attempt: number }
export interface ScheduledPostRepository {
  /** Atomically claim a due row with SELECT ... FOR UPDATE SKIP LOCKED. */
  claim(job: QueueJob): Promise<{ platform: string; request: PublishRequest } | null>
  markPublished(job: QueueJob, result: PublishResult): Promise<void>
  markRetry(job: QueueJob, error: PublishError, nextAttemptAt: Date): Promise<void>
  markFailed(job: QueueJob, error: PublishError): Promise<void>
  refreshCredentials(accountId: string): Promise<boolean>
}
/** BullMQ processor boundary; queue persistence and retries survive web process restarts. */
export class PublishWorker {
  constructor(private readonly registry: PublisherRegistry, private readonly repository: ScheduledPostRepository) {}
  async process(job: QueueJob): Promise<void> {
    const claimed = await this.repository.claim(job)
    if (!claimed) return // already claimed, cancelled, or delivered; duplicate jobs are harmless
    try {
      const result = await this.registry.forPlatform(claimed.platform).publish(claimed.request)
      await this.repository.markPublished(job, result)
    } catch (cause) {
      const error = cause instanceof PublishError ? cause : new PublishError('Provider unavailable', 'transient')
      if (error.kind === 'expired_token' && await this.repository.refreshCredentials(claimed.request.accountId)) throw error
      if ((error.kind === 'transient' || error.kind === 'rate_limit') && job.attempt < 5) {
        const backoff = error.retryAfterMs ?? Math.min(15 * 60_000, 2 ** job.attempt * 10_000)
        await this.repository.markRetry(job, error, new Date(Date.now() + backoff))
        throw error // BullMQ applies its retry policy; DB row remains the source of truth
      }
      await this.repository.markFailed(job, error)
    }
  }
}
