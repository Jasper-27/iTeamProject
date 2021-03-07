/*
Class for searching and modifying blob files.
Blob files are used to store large amounts of immutable data, profile pictures in this case

File allocates space in 128 byte "chunks", data will usually require many chunks
File headers point to the next free chunk, and the first bytes of a free chunk in a contiguous area of free chunks will contain the size of the free area and address of the next free chunk

Headers:
Next free chunk (8 bytes)

Free chunk format (only first free chunk in a free area):
Number of free chunks in area (8 bytes)|First chunk address of next free area (8 bytes)

Entry format:
Number of chunks allocated (8 bytes)|Actual length of data (8 bytes)|data (variable length)

Blob files are not designed to be searchable, as they are just large pools of space where other classes can store their data- it is up to the classes to remember where in the blob file they put it
*/

class blobAccess{
    static getData(filePath, position){
        // Return the data in the entry at the given position
        return new Promise((resolve, reject) => {

        });
    }

    static writeToEntry(filePath, position, data){
        // Overwrite the data in the entry at the given position
    }

    static allocate(filePath, amount){
        // Create an entry with enough chunks to hold given amount, and return the start position of the entry (to create new entries this can be used followed by writeToEntry)
    }

    static deallocate(filePath, position){
        // Deallocate the entry at the given position
    }
}