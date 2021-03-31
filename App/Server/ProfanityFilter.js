// Class for filtering out profanity
const fs = require("fs");
let banListPath = "";
var preset;
let rawData;

replacementSymbol = "*";  // The symbol to replace banned words with
wholeWordsOnly = "";  // Only filter out whole words
bannedStrings = [];

class ProfanityFilter {


    toggleCustom()
    {
        try {
            banListPath = __dirname + "/bannedWordsCustom.txt";
            console.log("🤬 Using Customised Profanity List!")
        }
        catch {
            console.log(err + " your nan")
        }
    }

    toggleDefault(){
        banListPath = __dirname + "/bannedWords.txt";
        console.log("🤬 Using Default Profanity List!");

    }

    savePreset(toggle){
        preset = toggle;
    }
    load() {

        if (preset == 1) {
            this.toggleCustom();
        }
        if (preset == 0) {
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
            this.readBanlistFromFile();
        }
    }

    filter(text)
    {
        // Replace any profanity with the given symbol
        for (let i = 0; i < bannedStrings.length; i++){
            let badString;
            if (this.wholeWords){
                badString = new RegExp("\\b" + bannedStrings[i] + "\\b", "gi");  // g flag to match all, i flag for case insensitive match
            }
            else
            {
                badString = new RegExp(bannedStrings[i], "gi");  // g flag to match all, i flag for case insensitive match
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
            rawData = fs.readFileSync(banListPath, 'utf8');
            bannedStrings = rawData.split(/\r?\n/);
            return rawData;




        } catch (e) {

            fs.writeFile('bannedWordsCustom.txt', "" ,function (err) {
                if (err) return console.log(err);

                bannedStrings = [];
                return "";
            });

        }
    }
}
module.exports = ProfanityFilter;