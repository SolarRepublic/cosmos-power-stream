import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

self.MonacoEnvironment = {
	getWorker(_: string, label: string) {
		return new editorWorker();
		// return new Promise<Worker>(() => {});
	},
};

export default monaco;
