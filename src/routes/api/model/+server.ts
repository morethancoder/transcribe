import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureModel, modelState, type ModelKind } from '$lib/server/model';

/** Report model status; starts the download automatically when missing. */
export const GET: RequestHandler = async ({ url }) => {
	// only the transcription model is fetched eagerly — the translation model
	// is a 500 MB download nobody should pay for until they ask to translate
	const kind: ModelKind = url.searchParams.get('kind') === 'translate' ? 'translate' : 'transcribe';
	const current = modelState(kind);
	if (kind === 'transcribe' && (current.status === 'missing' || current.status === 'error')) {
		ensureModel(kind);
		return json(modelState(kind));
	}
	return json(current);
};
