/**
 * @module cmd/models
 * Handler for the model listing and switching command.
 */

import { setActiveModel } from "../../shared/chat-session.js";
import { getModelRegistry } from "../../shared/models/model-registry.js";
import { parseProviderModel } from "../../shared/models/model-validation.js";
export { getModelCompletions } from "./getArgumentCompletions.js";

/**
 * @typedef {Object} CommandDependencies
 * @property {typeof getModelRegistry} [getModelRegistry]
 * @property {typeof parseProviderModel} [parseProviderModel]
 * @property {typeof setActiveModel} [setActiveModel]
 */

/**
 * Handle the models command (`hns model` and `/model`).
 *
 * @param {string[]} argv
 * @param {import('../registry.js').CommandContext & { __testDeps?: CommandDependencies }} [options]
 */
export async function runModelsCommand(argv, options = {}) {
    const deps = /** @type {CommandDependencies} */ ((/** @type {any} */ (options)).__testDeps || {});
    const {
        getModelRegistry: getModelRegistryFn = getModelRegistry,
        parseProviderModel: parseProviderModelFn = parseProviderModel,
        setActiveModel: setActiveModelFn = setActiveModel,
    } = deps;
    const { uiAPI, editor } = options;

    let targetModel;
    const firstArg = argv[0]?.trim();
    const modelRegistry = getModelRegistryFn();

    if (!firstArg) {
        if (uiAPI && editor) {
            const models = modelRegistry.getAvailable();

            if (models.length === 0) {
                uiAPI.appendSystemMessage("No models available.");
                editor.setText("");
                editor.disableSubmit = false;
                return;
            }

            const modelOptions = models
                .sort((modelA, modelB) => modelA.id.localeCompare(modelB.id))
                .map((model) => ({
                    value: `${model.provider}/${model.id}`,
                    label: `${model.provider}/${model.id}`,
                    description: model.name,
                }));

            const choice = await uiAPI.promptSelect("Switch model:", modelOptions);
            if (!choice) {
                editor.setText("");
                editor.disableSubmit = false;
                return;
            }

            targetModel = models.find((model) => `${model.provider}/${model.id}` === choice || model.id === choice);

            if (!targetModel) {
                uiAPI.appendSystemMessage(`Unknown model: ${choice}.`);
                editor.setText("");
                editor.disableSubmit = false;
                return;
            }
        } else {
            console.log("Usage: hns model <provider>/<model_id>");
            return;
        }
    } else {
        const parsedArgs = parseProviderModelFn(firstArg);
        if (!parsedArgs.ok) {
            if (uiAPI) {
                uiAPI.appendSystemMessage("Invalid model format. Use /model to switch.");
            } else {
                console.log("Invalid model format. Use provider/id.");
            }
            return;
        }

        targetModel = modelRegistry.find(parsedArgs.provider, parsedArgs.id);
        // Provide some feedback to the user on success/failure within the correct interface
        if (!targetModel) {
            if (uiAPI) {
                uiAPI.appendSystemMessage(`Unknown model: ${firstArg}. Use /model to switch.`);
            } else {
                console.log(`Unknown model: ${firstArg}`);
            }
            return;
        }
    }

    setActiveModelFn(targetModel.id, targetModel.provider);

    if (uiAPI) {
        uiAPI.appendSystemMessage(`Switched model to ${targetModel.provider}/${targetModel.id}`);
    } else {
        console.log(`Switched model to ${targetModel.provider}/${targetModel.id}`);
    }

    await Promise.resolve();
}
