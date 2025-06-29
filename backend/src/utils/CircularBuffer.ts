/**
 * CircularBuffer - A memory-efficient circular buffer implementation
 * Used for maintaining a sliding window of tokens without accumulating unlimited memory
 * 
 * Currently used methods:
 * - constructor(capacity) - Create buffer with fixed capacity
 * - push(...items) - Add items to buffer
 * - getRecent(count) - Get most recent N items
 * 
 * Additional utility methods available for future use:
 * - toArray() - Get all items in order
 * - getSize() - Get current item count
 * - getCapacity() - Get maximum capacity
 * - clear() - Remove all items
 * - isEmpty() - Check if buffer is empty
 * - isFull() - Check if buffer is at capacity
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private writeIndex: number = 0;
  private size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('CircularBuffer capacity must be greater than 0');
    }
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Add items to the buffer. Old items are overwritten when capacity is exceeded.
   */
  push(...items: T[]): void {
    for (const item of items) {
      this.buffer[this.writeIndex] = item;
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
      
      if (this.size < this.capacity) {
        this.size++;
      }
    }
  }

  /**
   * Get the most recent N items from the buffer
   * @param count Number of recent items to retrieve
   * @returns Array of recent items (may be less than count if buffer has fewer items)
   */
  getRecent(count: number): T[] {
    if (count <= 0 || this.size === 0) {
      return [];
    }

    const itemsToReturn = Math.min(count, this.size);
    const result: T[] = [];

    // Calculate starting position for reading
    let readIndex: number;
    if (this.size < this.capacity) {
      // Buffer not full yet, start from beginning
      readIndex = Math.max(0, this.size - itemsToReturn);
    } else {
      // Buffer is full, calculate position considering wrap-around
      readIndex = (this.writeIndex - itemsToReturn + this.capacity) % this.capacity;
    }

    // Read the items
    for (let i = 0; i < itemsToReturn; i++) {
      const index = (readIndex + i) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Get all items in the buffer in order (oldest to newest)
   */
  toArray(): T[] {
    if (this.size === 0) {
      return [];
    }

    const result: T[] = [];
    
    if (this.size < this.capacity) {
      // Buffer not full, read from start to writeIndex
      for (let i = 0; i < this.size; i++) {
        const item = this.buffer[i];
        if (item !== undefined) {
          result.push(item);
        }
      }
    } else {
      // Buffer is full, read from writeIndex (oldest) around to writeIndex-1 (newest)
      for (let i = 0; i < this.capacity; i++) {
        const index = (this.writeIndex + i) % this.capacity;
        const item = this.buffer[index];
        if (item !== undefined) {
          result.push(item);
        }
      }
    }

    return result;
  }

  /**
   * Get the current number of items in the buffer
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Get the maximum capacity of the buffer
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Clear all items from the buffer
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.writeIndex = 0;
    this.size = 0;
  }

  /**
   * Check if the buffer is empty
   */
  isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Check if the buffer is at full capacity
   */
  isFull(): boolean {
    return this.size === this.capacity;
  }
}