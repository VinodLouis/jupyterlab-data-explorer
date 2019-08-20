/*-----------------------------------------------------------------------------
| Support for `datasets.yml` files
|----------------------------------------------------------------------------*/

/**
 *
 * Refactor to support observable at core level and remove URL based mimetypes?
 *
 * Instead have structured URL converters?
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  JupyterLab
} from "@jupyterlab/application";
import {
  DataTypeNoArgs,
  Registry,
  createConverter,
  resolveExtensionConverter,
  relativeNestedDataType,
  resolveDataType,
  textDataType
} from "@jupyterlab/dataregistry";
import { Observable, of } from "rxjs";
import { IRegistry } from "./registry";
import { map } from "rxjs/operators";
import * as yaml from "js-yaml";
import { snippedDataType } from "./snippets";
import * as Ajv from "ajv";

const datasetSchema = require("./datasets-file.schema.json");

const ajv = new Ajv();
var validate = ajv.compile(datasetSchema);

const datasetsFileMimeType = "application/x.jupyterlab.datasets-file";

export type datasetsObjectType = {
  children?: Array<string>;
  datasets?: Array<{
    url: string;
    children?: Array<string>;
    snippets?: { [key: string]: string };
  }>;
};

export const datasetsFileDataType = new DataTypeNoArgs<
  Observable<datasetsObjectType>
>(datasetsFileMimeType);

function activate(app: JupyterFrontEnd, registry: Registry) {
  registry.addConverter(
    resolveExtensionConverter("datasets.yml", datasetsFileMimeType),
    resolveExtensionConverter("datasets.yaml", datasetsFileMimeType),
    createConverter(
      { from: textDataType, to: datasetsFileDataType },
      ({ data, type }) =>
        type === datasetsFileMimeType
          ? data.pipe(
              map(text => {
                const res = yaml.safeLoad(text);
                if (!validate(res)) {
                  throw validate.errors![0]!;
                }
                return res;
              })
            )
          : null
    ),
    createConverter(
      {
        from: datasetsFileDataType,
        to: relativeNestedDataType
      },
      ({ data }) =>
        data.pipe(
          map(file => {
            // Add other converters that fill in the data
            // TODO: Figure out how to update this if URLs in file change
            // TODO: Have this use createCoverter if we can return multiple
            // mimetypes from one converter.
            registry.addConverter(({ url, mimeType }) => {
              if (mimeType !== resolveDataType.createMimeType()) {
                return [];
              }
              if (!file.datasets) {
                return [];
              }
              const dataset = file.datasets.find(
                ({ url: innerURL }) => url.toString() === innerURL
              );
              if (!dataset) {
                return [];
              }
              return [
                // children data
                ...(dataset.children
                  ? [
                      {
                        mimeType: relativeNestedDataType.createMimeType(),
                        data: of(dataset.children),
                        cost: 1
                      }
                    ]
                  : []),
                // snippet data
                ...Object.entries(dataset.snippets || {}).map(
                  ([label, text]) => ({
                    mimeType: snippedDataType.createMimeType(label),
                    data: async () => text,
                    cost: 1
                  })
                )
              ];
            });

            return file.children || [];
          })
        )
    )
  );
}

export default {
  id: "@jupyterlab/dataregistry-extension:file",
  requires: [IRegistry],
  activate,
  autoStart: true
} as JupyterFrontEndPlugin<void>;
