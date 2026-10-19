/**
 * Simple in-memory queue to prevent rate limit issues
 * Processes kit generation requests one at a time with delays
 */

class KitQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastProcessTime = 0;
    this.MIN_DELAY_MS = 5000; // 5 seconds between kits
  }

  async add(kitId, jobDescription, companyUrl, daysAvailable) {
    console.log(`[queue] Adding kit ${kitId} to queue. Current queue size: ${this.queue.length}`);
    
    return new Promise((resolve, reject) => {
      this.queue.push({
        kitId,
        jobDescription,
        companyUrl,
        daysAvailable,
        resolve,
        reject,
      });
      
      this.processNext();
    });
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const item = this.queue.shift();

    try {
      // Ensure minimum delay between processing
      const now = Date.now();
      const timeSinceLastProcess = now - this.lastProcessTime;
      if (timeSinceLastProcess < this.MIN_DELAY_MS && this.lastProcessTime > 0) {
        const waitTime = this.MIN_DELAY_MS - timeSinceLastProcess;
        console.log(`[queue] Waiting ${waitTime}ms before processing next kit to avoid rate limits`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      console.log(`[queue] Processing kit ${item.kitId}. Remaining in queue: ${this.queue.length}`);
      
      // Import here to avoid circular dependency
      const { runPipeline } = require('../pipeline');
      const result = await runPipeline(
        item.kitId,
        item.jobDescription,
        item.companyUrl,
        item.daysAvailable
      );

      this.lastProcessTime = Date.now();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.processing = false;
      // Process next item if queue is not empty
      if (this.queue.length > 0) {
        setTimeout(() => this.processNext(), 1000);
      }
    }
  }

  getQueueSize() {
    return this.queue.length;
  }

  isProcessing() {
    return this.processing;
  }
}

// Singleton instance
const kitQueue = new KitQueue();

module.exports = { kitQueue };
