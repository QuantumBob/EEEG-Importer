import { createCity } from "./CityImporter.js"

const prepareDisplayName = (folder) => {
    if (folder.depth === 1) return folder.data.name;
    return prepareDisplayName(game.folders.get(folder.data.parent)) + '/' + folder.data.name;
}

const isFoundry8 = () => {
    const foundryVersion = game.version;
    return foundryVersion >= '0.8.0' && foundryVersion < '0.9.0';
}

export default class ImportWindow extends Application {

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            id: "md-importer",
            template: "modules/rwk-eeeg-importer/templates/importer.html",
            resizable: false,
            height: "auto",
            width: 400,
            minimizable: true,
            title: "EEEG Importer"
        }
    }

    activateListeners(html) {
        super.activateListeners(html);

        const locationSelector = html.find("#customLocation");
        const locationSelectorActors = html.find('#customLocationActor');
        html.find('[name="NPCsLocation"]').on('change', (event) => {
            if (event.target.id === 'NPCsCompendiiums')
                html.find('#NPCsActors')[0].disabled = true;
            else
                html.find('#NPCsActors')[0].disabled = false;
        });

        const folders = isFoundry8() ? game.folders : game.folders.entries;

        game.folders.forEach((folder) => {
            if (folder.data.type === 'JournalEntry')
                locationSelector.append(new Option(prepareDisplayName(folder), folder.data._id));
            if (folder.data.type === 'Actor')
                locationSelectorActors.append(new Option(prepareDisplayName(folder), folder.data._id));
        });

        html.find("#submit").on('click', () => {
            const textContent = html.find('#text-input')[0].value;
            const roadTextContent = html.find('#road-text-input')[0].value;
            const importAsCompendia = html.find('#NPCsCompendiiums')[0].checked;
            const importAsActors = html.find('#NPCsActors')[0].disabled ? false : html.find('#NPCsActors')[0].checked;
            const selectedLocation = locationSelector.find('option:selected').val();
            const selectedLocationActors = locationSelectorActors.find('option:selected').val();

            createCity(textContent,
                importAsActors,
                importAsCompendia,
                [selectedLocation !== 'default', selectedLocationActors !== 'default'],
                [selectedLocation, selectedLocationActors],
                roadTextContent);
        });
    }
}
