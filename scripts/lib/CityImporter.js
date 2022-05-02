import { loading, capitalize } from "../Utils.js";
import { testData } from "../../resources/Taylensea-for-FVTT.js";
import { testRoadData } from "../../resources/Taylensea-roads.js";

let mainJournalId;

const decodeHTML = (rawText) => {
    const txt = document.createElement("textarea");
    txt.innerHTML = rawText;
    return txt.value;
}

const prepareText = (rawText, pack = false) => {
    const decoded = decodeHTML(rawText);
    const $a = $('<div />', { html: decoded });
    const located = $a.find('.link-internal');

    if (pack) {
        for (const element of located) {
            let id = element.dataset.id;
            element.dataset.id = id !== '' || id ? `@Compendium[${id}]` : element.text;
            element.text = id !== '' || id ? `@Compendium[${id}]{${element.text}}` : element.text;
        }
    } else {
        located.replaceWith((index, text) => {
            let id = located[index].getAttribute("data-id");
            if (text.includes('Description of')) return `@JournalEntry[town]{${text}}`
            return id !== '' || id ? `@JournalEntry[${id}]{${text}}` : text;
        })
    }
    return $a.html()
}

const getTownName = (jsonData) => {
    const parser = new DOMParser();
    const elem = parser.parseFromString(jsonData.start, 'text/html');
    return $(elem.body).find('.town-name')[0].getAttribute("data-town-name");
}

const createJournalEntry = async (entityName, rawText, folder) => await JournalEntry.create({
    name: entityName,
    content: prepareText(rawText),
    folder: folder
})

const createActor = async (entityName, rawText, folder) => await Actor.create({
    name: entityName,
    data: {
        details: {
            biography: {
                value: prepareText(rawText)
            }
        }
    },
    type: 'npc',
    folder: folder
})

const createAndUpdateActor = (uidToActorIdMap, createdActorsArray) => async (actorData, NPCFolder) => {
    const newActor = await createActor(actorData.name, `<div class="EEEG">${actorData.output}</div>`, NPCFolder);
    uidToActorIdMap.set(actorData.key, newActor.data._id);
    createdActorsArray.push(newActor.data._id);
}

const createAndUpdateJournal = (uidToIdMap, createdArray) => async (journalData, folder) => {
    const newEntry = await createJournalEntry(journalData.name, `<div class="EEEG">${journalData.output}</div>`, folder);
    uidToIdMap.set(journalData.key, newEntry.data._id);
    createdArray.push(newEntry.data._id);
}

const createJournalEntryComp = async (entityName, rawText, pack, key = "") => await JournalEntry.create(
    {
        name: entityName,
        content: prepareText(rawText, pack),
        flags: {
            "EEEG-Importer": {
                "compendiumEntry": pack,
                "compdendiumId": key,
                "journalId": "",
                "links": [],
            }
        }
    },
    {
        pack: pack
    }
)

const createAndUpdateJournalComp = (uidToIdMap, createdArray) => async (journalData, pack) => {
    const newEntry = await createJournalEntryComp(journalData.name, `<div class="EEEG">${journalData.output}</div>`, pack, journalData.key);
    uidToIdMap.set(journalData.key, newEntry.data._id);
    createdArray.push(newEntry.data._id);
}

const parseSecAttributes = (NPCsAsActors, folderId, loadingBar, hasCustomNPCLocation, location) =>
    async (primaryAttribute, attributeType, createActor, createJournal) => {
        let folder, NPCFolder;
        if (!(hasCustomNPCLocation[0] && attributeType === 'NPCs'))
            folder = await Folder.create({ name: capitalize(attributeType), type: 'JournalEntry', parent: folderId });

        if (NPCsAsActors && attributeType === 'NPCs' && !hasCustomNPCLocation[1])
            NPCFolder = await Folder.create({
                name: capitalize(attributeType),
                type: 'Actor',
                parent: null
            });

        for (const secAttribute in primaryAttribute) {
            if (!primaryAttribute.hasOwnProperty(secAttribute)) continue;

            loadingBar();

            if (NPCsAsActors && attributeType === 'NPCs')
                await createActor(primaryAttribute[secAttribute], hasCustomNPCLocation[1] ? location[1] : NPCFolder.data._id);

            await createJournal(primaryAttribute[secAttribute], hasCustomNPCLocation[0] && attributeType === 'NPCs' ? location[0] : folder.data._id);
        }
    }

const parseSecAttributesComp = (pack, loadingBar) =>
    async (primaryAttribute, createJournalComp) => {

        for (const secAttribute in primaryAttribute) {
            if (!primaryAttribute.hasOwnProperty(secAttribute)) continue;

            loadingBar();

            await createJournalComp(primaryAttribute[secAttribute], pack);
        }
    }

const parseMainAttributes = async (attribute, cityName, attributeData, folderId, createdArray, pack = undefined) => {

    let newEntry;
    if (pack) {
        attributeData = tidyMainData(attributeData);
        newEntry = await createJournalEntryComp(cityName, attributeData, pack);
    } else {
        let name = attribute === 'start' ? cityName : attribute;
        name = name === 'town' ? `Description of ${cityName}` : name;
        newEntry = await createJournalEntry(name, attributeData, folderId);
    }
    createdArray.push(newEntry.data._id);
    mainJournalId = newEntry.data._id;
}

const tidyMainData = (data) => {
    const decoded = decodeHTML(data);
    const $a = $('<div />', { html: decoded });
    let result = $a.find("#brief-description");
    result[1].remove();
    result = $a.find("#detailed-description");
    result[0].remove();
    result = $a.find("[title = 'This changes each time you click.']");
    result[0].replaceWith(result[0].innerText);
    return $a.html();
}

const iterateJson = async (jsonData, cityName, folderId, NPCsAsActors, loadingBar, parseSecAttr, pack = undefined) => {
    let uidToIdMap = new Map(), uidToActorIdMap = new Map();
    let createdArray = [], createdActorsArray = [];
    let actorCreateMethod;
    let journalCreateMethod;

    if (pack) {
        journalCreateMethod = createAndUpdateJournalComp(uidToIdMap, createdArray);

    } else {
        actorCreateMethod = createAndUpdateActor(uidToActorIdMap, createdActorsArray);
        journalCreateMethod = createAndUpdateJournal(uidToIdMap, createdArray);
    }

    for (const attribute in jsonData) {
        if (!jsonData.hasOwnProperty(attribute)) continue;

        loadingBar();
        if (typeof jsonData[attribute] !== 'string') {
            if (pack) {
                await parseSecAttr(jsonData[attribute], journalCreateMethod);
            } else
                await parseSecAttr(jsonData[attribute], attribute, actorCreateMethod, journalCreateMethod);
        }
        else await parseMainAttributes(attribute, cityName, jsonData[attribute], folderId, createdArray, pack ? pack : undefined);
    }
    return [[uidToIdMap, createdArray], [uidToActorIdMap, createdActorsArray]]
}

const secondPassJournals = async (ids, loadingBar, packName = undefined) => {

    const allJournals = packName ? game.packs : game.journal;

    if (packName) {
        const pack = game.packs.get(packName);
        let journals = {};

        pack.contents.forEach((e, i) => {
            journals[pack.contents[i].id] = pack.contents[i];
        });

        for (const id of ids[1]) {
            loadingBar();
            const journal = journals[id];
            const journalClone = JSON.parse(JSON.stringify(journal));

            journalClone.flags["EEEG-Importer"].compdendiumId = journalClone._id;

            journalClone.content = journalClone.content.replace(/@Compendium\[(\w+)\]/g, (_0, uid) => `@Compendium[${packName}.${ids[0].get(uid) || ids[0].get(capitalize(uid))}]`);

            journalClone.content = journalClone.content.replace(/@Compendium\[(\w+-\w+-\w+-\w+-\w+)\]/g, (_0, uid) => `@Compendium[${packName}.${ids[0].get(uid)}]`);

            journalClone.content = journalClone.content.replace(/@Compendium\[undefined\]{(.*?)}/g, (_0, name) => name);

            // journalClone.content = journalClone.content.replace(/@Compendium\[link-internal\]{(.*?)}/g, (_0, name) => name);

            journalClone.content = journalClone.content.replace(/@Compendium\[tip-([\w-]+)\]{(.*?)}/g, (_0, original, name) => {
                for (const value of pack.contents.values())
                    if (value.data.name.toLowerCase() === name.toLowerCase())
                        return `@Compendium[${packName}.${value.data._id}]{${name}}`
                return name;
            })

            await journal.update(journalClone);
        }
    } else {
        for (const id of ids[1]) {
            loadingBar();
            const journal = allJournals.get(id);
            const journalClone = JSON.parse(JSON.stringify(journal));
            journalClone.content = journalClone.content.replace(/@JournalEntry\[(\w+)\]/g, (_0, uid) => `@JournalEntry[${ids[0].get(uid) || ids[0].get(capitalize(uid))}]`);
            journalClone.content = journalClone.content.replace(/@JournalEntry\[(\w+-\w+-\w+-\w+-\w+)\]/g, (_0, uid) => `@JournalEntry[${ids[0].get(uid)}]`);
            journalClone.content = journalClone.content.replace(/@JournalEntry\[undefined\]{(.*?)}/g, (_0, name) => name);
            journalClone.content = journalClone.content.replace(/@JournalEntry\[link-internal\]{(.*?)}/g, (_0, name) => name);
            journalClone.content = journalClone.content.replace(/@JournalEntry\[tip-([\w-]+)\]{(.*?)}/g, (_0, original, name) => {
                for (const value of allJournals.values())
                    if (value.data.name.toLowerCase() === name.toLowerCase())
                        return `@JournalEntry[${value.data._id}]{${name}}`
                return name;
            })
            await journal.update(journalClone);
        }
    }
}

const secondPassActors = async (ids) => {

    const allActors = game.actors;
    const allJournals = game.journal;
    for (const id of ids[1]) {
        const actor = allActors.get(id);
        if (!actor) continue;
        const actorClone = JSON.parse(JSON.stringify(actor));
        let replaceText = actorClone.data.details.biography.value;
        replaceText = replaceText.replace(/@JournalEntry\[([\w]+)\]{(.*?)}/g, (_0, original, name) => {
            for (const value of allJournals.values())
                if (value.data.name.toLowerCase() === name.toLowerCase())
                    return `@JournalEntry[${value.data._id}]{${name}}`
            return name;
        });
        replaceText = replaceText.replace(/@JournalEntry\[(\w+-\w+-\w+-\w+-\w+)\]/g, (_0, uid) => `@Actor[${ids[0].get(uid)}]`);
        replaceText = replaceText.replace(/@Actor\[undefined\]{(.*?)}/g, (_0, name) => name);
        actorClone.data.details.biography.value = replaceText;
        await actor.update(actorClone);
    }

}

const getTownSize = (jsonData) => {
    let townSize = 0;
    townSize += Object.keys(jsonData).length;
    for (const attribute in jsonData) {
        if (!jsonData.hasOwnProperty(attribute)) continue;

        if (typeof jsonData[attribute] !== 'string') townSize += Object.keys(jsonData[attribute]).length * 2;
    }
    return townSize;
}

const createCity = async (rawText, NPCsAsActors, NPCsAsCompendia, hasCustomNPCLocation, location, rawRoadText) => {

    let i = [];
    const comp = game.packs.get(`world.Taylensea`);
    if (comp)
        await comp.delete();

    if (rawRoadText.length === 0) rawRoadText = '{}';

    // const jsonData = JSON.parse(rawText);
    const jsonData = testData;
    // const jsonRoadData = JSON.parse(rawRoadText);
    const jsonRoadData = testRoadData;

    /* merge jsons */
    if (Object.keys(jsonRoadData["roads"]).length !== 0) {
        let roadData = {
            "roads": {}
        };
        Object.keys(jsonRoadData["roads"]).forEach(key => {
            roadData["roads"][key] = {
                output: jsonRoadData["roads"][key].description + jsonRoadData["roads"][key].features,
                name: jsonRoadData["roads"][key].name,
                key: jsonRoadData["roads"][key].key
            }
        });
        mergeObject(jsonData, roadData);
    }

    const loadingBar = loading('Importing city.')(0)(getTownSize(jsonData) - 1);
    const townName = getTownName(jsonData);

    let ids;
    let mainFolder = null;

    if (NPCsAsCompendia) {
        jsonData.town = jsonData.start + jsonData.town;
        delete jsonData.start;

        /* create compendium pack if it doesn't exist */
        let compendium = game.packs.get(`world.${townName}`);
        if (!compendium) {
            compendium = await CompendiumCollection.createCompendium({ name: townName, label: townName, type: "JournalEntry" });
        }
        const secAttrParser = parseSecAttributesComp(compendium.collection, loadingBar);

        ids = await iterateJson(jsonData, townName, undefined, NPCsAsActors, loadingBar, secAttrParser, compendium.collection);
        ids[0][0].set('town', `Description of ${townName}`);

        await secondPassJournals(ids[0], loadingBar, compendium.collection);

        await game.journal.importFromCompendium(compendium, mainJournalId);

    } else {
        mainFolder = await Folder.create({ name: townName, type: 'JournalEntry', parent: null });
        const secAttrParser = parseSecAttributes(NPCsAsActors, mainFolder.data._id, loadingBar, hasCustomNPCLocation, location);

        ids = await iterateJson(jsonData, townName, mainFolder.data._id, NPCsAsActors, loadingBar, secAttrParser);
        ids[0][0].set('town', `Description of ${townName}`);

        await secondPassJournals(ids[0], loadingBar);
        if (NPCsAsActors) await secondPassActors(ids[1]);
    }

    ui.notifications.info("Your city has been imported successfully");
}

export { createCity }
