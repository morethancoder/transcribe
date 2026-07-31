import { ensureModel } from '$lib/server/model';
import { reapOrphans } from '$lib/server/jobs';

// Start fetching the transcription model as soon as the server boots, so it's
// usually ready by the time someone drops in a file. The translation model is
// fetched on demand — see $lib/server/model.
ensureModel('transcribe');

// work dirs kept for translation don't survive a restart — clear the old ones
void reapOrphans();
