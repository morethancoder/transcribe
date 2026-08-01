import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	downloadedModels,
	ensureModel,
	modelIdFor,
	modelState,
	selectModel,
	selectedModel,
	type ModelKind
} from '$lib/server/model';
import { isModelId } from '$lib/models';

/**
 * Report model status; starts the download automatically when missing.
 *
 * `selected` and `resolved` both appear because they can differ: `selected` is
 * the model chosen for transcription, `resolved` is the one actually backing
 * the role being asked about — a different file whenever the chosen model can't
 * translate and the translate role has to fall back.
 */
export const GET: RequestHandler = async ({ url }) => {
	// only the transcription model is fetched eagerly — the translation model
	// is a large download nobody should pay for until they ask to translate
	const kind: ModelKind = url.searchParams.get('kind') === 'translate' ? 'translate' : 'transcribe';
	const current = modelState(kind);
	const ids = {
		selected: selectedModel(),
		resolved: modelIdFor(kind),
		available: downloadedModels()
	};
	if (kind === 'transcribe' && (current.status === 'missing' || current.status === 'error')) {
		ensureModel(kind);
		return json({ ...modelState(kind), ...ids });
	}
	return json({ ...current, ...ids });
};

/**
 * Choose the transcription model.
 *
 * The download starts here but isn't waited on — the same polling that covers
 * first launch covers a switch, so picking a model you don't have yet behaves
 * exactly like opening the app for the first time, and picking one already on
 * disk is instant.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body: unknown = await request.json().catch(() => null);
	const id = (body as { model?: unknown })?.model;
	if (!isModelId(id)) return json({ message: 'Unknown model.' }, { status: 400 });

	selectModel(id);
	ensureModel('transcribe');
	return json({
		...modelState('transcribe'),
		selected: selectedModel(),
		resolved: modelIdFor('transcribe'),
		available: downloadedModels()
	});
};
