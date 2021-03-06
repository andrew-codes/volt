const path = require("path");
const { noop } = require("underscore");
const { Uri, ViewColumn, window } = require("vscode");

let currentPanel;

module.exports = class ReactPanel {
  static get currentPanel() {
    return currentPanel;
  }
  static get viewType() {
    return "react";
  }

  static createOrShow(
    extensionPath,
    distDirectoryName,
    store,
    onDidDispose = noop
  ) {
    const column = window.activeTextEditor
      ? window.activeTextEditor.viewColumn
      : undefined;

    if (ReactPanel.currentPanel) {
      ReactPanel.currentPanel.panel.reveal(column);
    } else {
      currentPanel = new ReactPanel(
        extensionPath,
        column || ViewColumn.One,
        distDirectoryName,
        store,
        {
          onDidDispose
        }
      );
    }
  }

  constructor(
    extensionPath,
    column,
    distDirectoryName,
    store,
    { onDidDispose }
  ) {
    this.extensionPath = extensionPath;
    this.dist = distDirectoryName;
    this.store = store;
    this.disposables = [];
    this.onDidDispose = onDidDispose;
    this.dispose = this.dispose.bind(this);
    this.getHtmlForWebview = this.getHtmlForWebview.bind(this);

    this.panel = window.createWebviewPanel(
      ReactPanel.viewType,
      "React",
      column,
      {
        enableScripts: true,
        localResourceRoots: [Uri.file(path.join(this.extensionPath, this.dist))]
      }
    );

    this.panel.webview.html = this.getHtmlForWebview();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.unsubscribe = store.subscribe(() => {
      if (currentPanel) {
        this.panel.webview.postMessage({ state: store.getState() });
      }
    });

    this.panel.webview.onDidReceiveMessage(
      message => {
        store.dispatch(message);
      },
      null,
      this.disposables
    );
  }

  dispose() {
    currentPanel = undefined;
    this.unsubscribe();
    this.onDidDispose();

    // Clean up our resources
    this.panel.dispose();

    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  getHtmlForWebview() {
    const manifest = require(path.join(
      this.extensionPath,
      this.dist,
      "asset-manifest.json"
    ));
    const mainScript = manifest["main.js"];
    const mainStyle = manifest["main.css"];
    const scriptPathOnDisk = Uri.file(
      path.join(this.extensionPath, this.dist, mainScript)
    );
    const scriptUri = scriptPathOnDisk.with({ scheme: "vscode-resource" });
    let styleUri;
    if (mainStyle) {
      const stylePathOnDisk = Uri.file(
        path.join(this.extensionPath, this.dist, mainStyle)
      );
      styleUri = stylePathOnDisk.with({ scheme: "vscode-resource" });
    }
    const nonce = getNonce();
    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
				<meta name="theme-color" content="#000000">
				<title>React App</title>
				${styleUri ? `<link rel="stylesheet" type="text/css" href="${styleUri}">` : ""}
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}';style-src vscode-resource: 'unsafe-inline' http: https: data:;">
				<base href="${Uri.file(path.join(this.extensionPath, this.dist)).with({
          scheme: "vscode-resource"
        })}/">
			</head>
			<body>
				<noscript>You need to enable JavaScript to run this app.</noscript>
				<div id="root"></div>
        <script nonce="${nonce}">window.__initialState__ = ${JSON.stringify(
      this.store.getState()
    )};
    window.vscode = acquireVsCodeApi();</script>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }
};

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
