// Class for filtering out profanity
const fs = require("fs");
var banListPath;
filterSymbol = "*";

// The symbol to replace banned words with
wholeWords = "";  // Only filter out whole words
bannedStrings = [];
replacementSymbol = "*";
wholeWordsOnly = "";
bannedStrings = "";
var preset;
let rawData;




class ProfanityFilter {
    toggleCustom()
    {
        banListPath = __dirname + "/bannedWordsCustom.txt";
        console.log("🤬 Using Customised Profanity List!")
    }

    toggleDefault(){
        banListPath = __dirname + "/bannedWords.txt";
        console.log("🤬 Using Default Profanity List!");

    }

    savePreset(toggle){
        preset = toggle;
    }
    load() {

        if (preset == 1){
            this.toggleCustom();
        }
        if (preset == 0){
            this.toggleDefault();
        }

        constructor(replacementSymbol, wholeWordsOnly)
        {
            // Can use this to configure options for the filter later
            if (replacementSymbol == undefined) {
                this.replacementSymbol = "*";
            } else {
                this.replacementSymbol = replacementSymbol;
            }
            if (typeof wholeWordsOnly != "boolean") {
                this.wholeWords = false;
            } else {
                this.wholeWords = wholeWordsOnly;
            }
            //readBanlistFromFile();
        }
    }

        filter(text)
        {
            // Replace any profanity with the given symbol
            for (let i = 0; i < this.bannedStrings.length; i++) {
                let badString;
                if (this.wholeWords) {
                    badString = new RegExp("\\b" + this.bannedStrings[i] + "\\b", "gi");  // g flag to match all, i flag for case insensitive match
                } else {
                    badString = new RegExp(this.bannedStrings[i], "gi");  // g flag to match all, i flag for case insensitive match
                }
                text = text.replace(badString, (match) => {
                    let newString = "";
                    while (newString.length < match.length) {
                        newString += this.replacementSymbol;
                    }
                    return newString;
                });
            }
            return text;
        }
        //Needs Logic on wether to use custom or not as default.

    readBanlistFromFile(){
            try{
                // Each banned word of phrase should be on a new line
                rawData = fs.readFileSync(banListPath, 'utf8');
                return rawData;
            } catch (e) {

                banListPath = __dirname + "/bannedWords.txt";
                bannedStrings = [];
                return false;
            }
        }


    }





module.exports = ProfanityFilter;