// Class for filtering out profanity
const fs = require("fs");
const banListPath = __dirname + "/bannedWords.txt"

class ProfanityFilter{
    filterSymbol;  // The symbol to replace banned words with
    wholeWords;  // Only filter out whole words
    bannedStrings = [];
    constructor(replacementSymbol, wholeWordsOnly){
        // Can use this to configure options for the filter later
        if (replacementSymbol == undefined){
            this.replacementSymbol = "*";
        }
        else{
            this.replacementSymbol = replacementSymbol;
        }
        if (typeof wholeWordsOnly != "boolean"){
            this.wholeWords = false;
        }
        else{
            this.wholeWords = wholeWordsOnly;
        }
        this.readBanlistFromFile();
    }

    filter(text){
        // Replace any profanity with the given symbol
        for (let i = 0; i < this.bannedStrings.length; i++){
            let badString;
            if (this.wholeWords){
                badString = new RegExp("\\b" + this.bannedStrings[i] + "\\b", "gi");  // g flag to match all, i flag for case insensitive match
            }
            else
            {
                badString = new RegExp(this.bannedStrings[i], "gi");  // g flag to match all, i flag for case insensitive match
            }
            text = text.replace(badString, (match) => {
                let newString = "";
                while (newString.length < match.length){
                    newString += this.replacementSymbol;
                }
                return newString;
            });
        }
        return text;
    }

    readBanlistFromFile(){
        try{
            // Each banned word of phrase should be on a new line
            let rawData = fs.readFileSync(banListPath).toString();
            this.bannedStrings = rawData.split(/\r?\n/);
        }
        catch (e){
            this.bannedStrings = [];
        }
    }
}
module.exports = ProfanityFilter;