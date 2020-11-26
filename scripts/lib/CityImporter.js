const decodeHTML = (rawText) => {
    const txt = document.createElement("textarea");
    txt.innerHTML = rawText;
    return txt.value;
}

const prepareText = (rawText) => {
    const decoded = decodeHTML(rawText);
    const $a = $('<div />', {html: decoded});
    const located = $a.find('.link-internal');
    located.replaceWith((index, text) => {
        const id = located[index]?.parentElement?.parentElement?.id || located[index]?.parentElement?.id;
        if (text.includes('Description of')) return `@JournalEntry[town]{${text}}`
        return id !== '' || id ? `@JournalEntry[${id}]{${text}}` : text;
    })
    return $a.html()
}

const getTownName = (jsonData) => {
    return (jsonData.start.match(/Description of (.*?)&/))[1];
}

const createJournalEntry = async (entityName, rawText, folder) => await JournalEntry.create({
    name: entityName,
    content: prepareText(rawText),
    folder: folder
})

const iterateJson = async (jsonData, cityName) => {
    let uidToIdMap = new Map();
    let createdArray = [];
    for (const attribute in jsonData) {
        if (!jsonData.hasOwnProperty(attribute)) continue;

        if (typeof jsonData[attribute] !== 'string') {
            const folder = await Folder.create({name: attribute, type: 'JournalEntry', parent: null});
            for (const secAttribute in jsonData[attribute]) {
                if (!jsonData[attribute].hasOwnProperty(secAttribute)) continue;
                const newEntry = await createJournalEntry(jsonData[attribute][secAttribute].name, jsonData[attribute][secAttribute].output, folder.data._id);
                uidToIdMap.set(secAttribute, newEntry.data._id);
                createdArray.push(newEntry.data._id);
            }
        } else {
            let name = attribute === 'start' ? cityName : attribute;
            name = name === 'town' ? `Description of ${cityName}` : name;

            const newEntry = await createJournalEntry(name, jsonData[attribute], null);
            createdArray.push(newEntry.data._id);
        }
    }
    return [uidToIdMap, createdArray];
}

const secondPass = async (ids) => {
    const allJournals = game.journal;
    for (const id of ids[1]) {
        const journal = allJournals.get(id);
        const journalClone = JSON.parse(JSON.stringify(journal));
        journalClone.content = journalClone.content.replace(/@JournalEntry\[(\w+)\]/g, (_0, uid) => `@JournalEntry[${ids[0].get(uid)}]`);
        journalClone.content = journalClone.content.replace(/@JournalEntry\[(\w+-\w+-\w+-\w+-\w+)\]/g, (_0, uid) => `@JournalEntry[${ids[0].get(uid)}]`);
        journalClone.content = journalClone.content.replace(/@JournalEntry\[undefined\]{(.*?)}/g, (_0, name) => name);
        journalClone.content = journalClone.content.replace(/@JournalEntry\[tip-([\w-]+)\]{(.*?)}/g, (_0, original, name) => {
            for (const value of allJournals.values())
                if (value.data.name.toLowerCase() === name.toLowerCase())
                    return `@JournalEntry[${value.data._id}]{${name}}`
            return name;
        })
        await journal.update(journalClone);
    }
}

const createCity = async (rawText) => {
    const jsonData = JSON.parse(rawText);
    const townName = getTownName(jsonData)
    const ids = await iterateJson(jsonData, townName);
    ids[0].set('town', `Description of ${townName}`);
    await secondPass(ids);
}

export {createCity}