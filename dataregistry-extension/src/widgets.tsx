/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from "@jupyterlab/application";
import {
  WidgetTracker,
  MainAreaWidget,
  ReactWidget
} from "@jupyterlab/apputils";
import {
  DataType,
  DataTypeStringArg,
  Registry,
  URL_,
  createConverter
} from "@jupyterlab/dataregistry";
import { Widget } from "@phosphor/widgets";
import * as React from "react";
import { viewerDataType } from "./viewers";
import { RegistryToken } from "./registry";

const tracker = new WidgetTracker({ namespace: "dataregistry" });
const commandID = "dataregistry:view-url";

export const widgetDataType = new DataTypeStringArg<Widget>(
  "application/x.jupyter.widget",
  "label"
);

function extractWidgetArgs(
  widget: Widget
): {
  label: string;
  url: string;
} {
  const [label, url] = JSON.parse(widget.id);
  return { label, url };
}

export interface IHasURL_ {
  url: URL_;
}

export function hasURL_(t: any): t is IHasURL_ {
  return "url" in t;
}

class DataWidget extends MainAreaWidget implements IHasURL_ {
  constructor(content: Widget, url: URL_, label: string) {
    super({ content });
    this.id = JSON.stringify([label, url.toString()]);
    this.title.label = `${label}: ${url}`;
    this.title.closable = true;
    this.url = url;
  }
  url: URL_;
}

const wrappedWidgetDataType = new DataTypeStringArg<DataWidget>(
  "application/x.jupyter.wrapped-widget",
  "label"
);

export const reactDataType: DataType<
  string,
  React.ReactElement<any>
> = new DataTypeStringArg<React.ReactElement<any>>(
  "application/x.jupyter.react",
  "label"
);

export default {
  activate,
  id: "@jupyterlab/dataregistry-extension:widgets",
  requires: [ILabShell, RegistryToken, ILayoutRestorer],
  autoStart: true
} as JupyterFrontEndPlugin<void>;

function activate(
  app: JupyterFrontEnd,
  labShell: ILabShell,
  registry: Registry,
  restorer: ILayoutRestorer
) {
  registry.addConverter(
    createConverter(
      { from: widgetDataType, to: wrappedWidgetDataType },
      ({ type, url, data }) => ({
        type,
        data: new DataWidget(data, url.toString(), type)
      })
    ),
    createConverter(
      { from: reactDataType, to: widgetDataType },
      ({ data, type }) => ({ type, data: ReactWidget.create(data) })
    ),
    createConverter(
      { from: wrappedWidgetDataType, to: viewerDataType },
      ({ data, type }) => ({
        type,
        data: () => {
          if (!tracker.has(data)) {
            tracker.add(data);
          }
          if (!data.isAttached) {
            labShell.add(data, "main");
          }
          app.shell.activateById(data.id);
        }
      })
    )
  );

  app.commands.addCommand(commandID, {
    execute: args => {
      const url = args.url as string;
      const label = args.label as string;
      viewerDataType.filterDataset(registry.getURL(url)).get(label)!();
    },
    label: args => `${args.label} ${args.url}`
  });

  restorer.restore(tracker, {
    name: (widget: Widget) => widget.id,
    command: commandID,
    args: extractWidgetArgs
  });
}