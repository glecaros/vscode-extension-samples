/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {
	CompletionList,
	createConnection,
	Diagnostic,
	InitializeParams,
	ProposedFeatures,
	SemanticTokensBuilder,
	TextDocuments,
	TextDocumentSyncKind,
	SemanticTokensLegend,
	SemanticTokens,
} from 'vscode-languageserver/node';
import { getLanguageModes, LanguageModes } from './languageModes';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let languageModes: LanguageModes;

interface PromptTurns {
	role: 'user' | 'system';
	content: string;
}

interface DocumentParts {
	prelude: any;
	prompt: PromptTurns[];

}

const legend: SemanticTokensLegend = {
	tokenTypes: ["variable", "interpolation-delimiter"],
	tokenModifiers: []
};


function parseDocumentForSemanticTokens(document: TextDocument): SemanticTokens {
	// Implement your logic to parse the document and identify the markdown parts and interpolation markers
	// For each identified token, add its line, character start position, length, token type, and token modifier to the tokens array
	const builder = new SemanticTokensBuilder();

	return builder.build();
}

connection.onInitialize((_params: InitializeParams) => {
	languageModes = getLanguageModes();

	documents.onDidClose(e => {
		languageModes.onDocumentRemoved(e.document);
	});
	connection.onShutdown(() => {
		languageModes.dispose();
	});

	connection.onRequest("textDocument/semanticTokens/full", async (params) => {
		// Get the text document
		const document = documents.get(params.textDocument.uri);
		if (!document) {
			return null;
		}

		// Parse the document and identify the markdown parts and interpolation markers
		const tokens = parseDocumentForSemanticTokens(document);

		// Return the semantic tokens
		return { data: tokens };
	});



	return {
		capabilities: {
			semanticTokensProvider: {
				documentSelector: { scheme: 'file', language: 'prompty'},
				legend,
				full: true
			},
			textDocumentSync: TextDocumentSyncKind.Full,
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: false
			}
		}
	};
});
// connection.onRequest("textDocument/semanticTokens/full", (params) => {
// 	// Implement your logic to provide semantic tokens for the given document here.
// 	// You should return the semantic tokens as a response.
// 	const semanticTokens = computeSemanticTokens(params.textDocument.uri);
// 	return semanticTokens;
//   });

connection.onDidChangeConfiguration(_change => {
	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument) {
	try {
		const version = textDocument.version;
		const diagnostics: Diagnostic[] = [];
		if (textDocument.languageId === 'html1') {
			const modes = languageModes.getAllModesInDocument(textDocument);
			const latestTextDocument = documents.get(textDocument.uri);
			if (latestTextDocument && latestTextDocument.version === version) {
				// check no new version has come in after in after the async op
				modes.forEach(mode => {
					if (mode.doValidation) {
						mode.doValidation(latestTextDocument).forEach(d => {
							diagnostics.push(d);
						});
					}
				});
				connection.sendDiagnostics({ uri: latestTextDocument.uri, diagnostics });
			}
		}
	} catch (e) {
		connection.console.error(`Error while validating ${textDocument.uri}`);
		connection.console.error(String(e));
	}
}

connection.onCompletion(async (textDocumentPosition, token) => {
	const document = documents.get(textDocumentPosition.textDocument.uri);
	if (!document) {
		return null;
	}

	const mode = languageModes.getModeAtPosition(document, textDocumentPosition.position);
	if (!mode || !mode.doComplete) {
		return CompletionList.create();
	}
	const doComplete = mode.doComplete!;

	return doComplete(document, textDocumentPosition.position);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
