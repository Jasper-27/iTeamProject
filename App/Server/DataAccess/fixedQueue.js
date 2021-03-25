/* Class for fixed length queues, used by blockAccess 
If an item is added while the queue is full, the first item is removed
*/
class fixedQueue{
    size;
    usedSize;
    queue;

    constructor(size){
        this.queue = [];
        this.size = size;
    }

    push(item){
        // Add item to queue, removing first item if the queue is full
        if (this.size <= this.queue.length){
            this.queue.shift();
        }
        else this.usedSize++;
        this.queue.push(item);
    }

    pop(){
        // Remove last item in queue and remove it
        this.usedSize--;
        return this.queue.pop();
    }

    merge(queueToMerge){
        // Merge another fixedQueue object into this one
        if (queueToMerge.usedSize + this.usedSize <= this.size){
            this.queue = this.queue.concat(queueToMerge);
            this.usedSize = queueToMerge.usedSize + this.usedSize;
        }
        else{
            for (let i = 0; i < queueToMerge.usedSize; i++){
                this.push(queueToMerge.queue[i]);
            }
        }
    }
    
}

module.exports = fixedQueue;