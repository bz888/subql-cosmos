// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { TextDecoder } from 'util';
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { toHex } from '@cosmjs/encoding';
import { Uint53 } from '@cosmjs/math';
import { DecodeObject, GeneratedType, Registry } from '@cosmjs/proto-signing';
import { Block, IndexedTx } from '@cosmjs/stargate';
import {
  Tendermint34Client,
  toRfc3339WithNanoseconds,
  BlockResultsResponse,
} from '@cosmjs/tendermint-rpc';
import {
  BlockResponse,
  Validator,
} from '@cosmjs/tendermint-rpc/build/tendermint34/responses';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import {
  getLogger,
  NetworkMetadataPayload,
  ConnectionPoolService,
  ApiService as BaseApiService,
} from '@subql/node-core';
import {
  CosmosProjectNetConfig,
  SubqueryProject,
} from '../configure/SubqueryProject';
import * as CosmosUtil from '../utils/cosmos';
import { CosmosClientConnection } from './cosmosClient.connection';
import { BlockContent } from './types';

// https://github.com/polkadot-js/api/blob/12750bc83d8d7f01957896a80a7ba948ba3690b7/packages/rpc-provider/src/ws/index.ts#L43
const MAX_RECONNECT_ATTEMPTS = 5;

const logger = getLogger('api');

@Injectable()
export class ApiService
  extends BaseApiService<SubqueryProject, CosmosClient>
  implements OnApplicationShutdown
{
  private fetchBlocksBatches = CosmosUtil.fetchBlocksBatches;
  networkMeta: NetworkMetadataPayload;
  registry: Registry;

  constructor(
    @Inject('ISubqueryProject') public project: SubqueryProject,
    private connectionPoolService: ConnectionPoolService<CosmosClientConnection>,
  ) {
    super(project);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.connectionPoolService.onApplicationShutdown();
  }

  private metadataMismatchError(
    metadata: string,
    expected: string,
    actual: string,
  ): Error {
    return Error(
      `Value of ${metadata} does not match across all endpoints\n
       Expected: ${expected}
       Actual: ${actual}`,
    );
  }

  async init(): Promise<ApiService> {
    try {
      const { network } = this.project;

      const chainTypes = await this.getChainType(network);

      const connections: CosmosClientConnection[] = [];

      const endpoints = Array.isArray(network.endpoint)
        ? network.endpoint
        : [network.endpoint];

      await Promise.all(
        endpoints.map(async (endpoint) => {
          const connection = await CosmosClientConnection.create(endpoint, {
            chainTypes,
          });
          const api = connection.api;
          if (!this.networkMeta) {
            this.networkMeta = {
              chain: network.chainId,
              specName: undefined,
              genesisHash: undefined,
            };

            const chainId = await api.getChainId();
            if (network.chainId !== chainId) {
              const err = new Error(
                `Network chainId doesn't match expected genesisHash. Your SubQuery project is expecting to index data from "${network.chainId}", however the endpoint that you are connecting to is different("${this.networkMeta.genesisHash}). Please check that the RPC endpoint is actually for your desired network or update the genesisHash.`,
              );
              logger.error(err, err.message);
              throw err;
            }
          } else {
            const chainId = await api.getChainId();
            if (chainId !== this.networkMeta.chain) {
              throw this.metadataMismatchError(
                'chainID',
                this.networkMeta.chain,
                chainId,
              );
            }
          }

          connections.push(connection);
        }),
      );

      this.connectionPoolService.addBatchToConnections(connections);

      return this;
    } catch (e) {
      logger.error(CosmosClient.handleError(e), 'Failed to init api service');
      process.exit(1);
    }
  }

  get api(): CosmosClient {
    return this.connectionPoolService.api.api;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSafeApi(height: number): Promise<CosmosSafeClient> {
    return this.connectionPoolService.api.getSafeApi(height);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getChainType(
    network: Partial<CosmosProjectNetConfig>,
  ): Promise<Record<string, GeneratedType>> {
    if (!network.chainTypes) {
      return {};
    }

    const res: Record<string, GeneratedType> = {};
    for (const [
      userPackageName,
      { messages, packageName },
    ] of network.chainTypes) {
      const pkgName = packageName ?? userPackageName;
      for (const msg of messages) {
        logger.info(`Registering chain message type "/${pkgName}.${msg}"`);
        const msgObj = network.chainTypes.protoRoot.lookupTypeOrEnum(
          `${pkgName}.${msg}`,
        );
        res[`/${pkgName}.${msg}`] = msgObj;
      }
    }
    return res;
  }

  async fetchBlocks(batch: number[]): Promise<BlockContent[]> {
    return this.fetchBlocksGeneric<BlockContent>(
      () => (blockArray: number[]) =>
        this.fetchBlocksBatches(this.api, blockArray),
      batch,
    );
  }
}

export class CosmosClient extends CosmWasmClient {
  constructor(
    private readonly tendermintClient: Tendermint34Client,
    public registry: Registry,
  ) {
    super(tendermintClient);
  }

  /*
  async chainId(): Promise<string> {
    return this.getChainId();
  }

  async finalisedHeight(): Promise<number> {
    return this.getHeight();
  }
  */

  // eslint-disable-next-line @typescript-eslint/require-await
  async blockInfo(height?: number): Promise<BlockResponse> {
    return this.tendermintClient.block(height);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async txInfoByHeight(height: number): Promise<readonly IndexedTx[]> {
    return this.searchTx({ height: height });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async blockResults(height: number): Promise<BlockResultsResponse> {
    return this.tendermintClient.blockResults(height);
  }

  decodeMsg<T = unknown>(msg: DecodeObject): T {
    try {
      const decodedMsg = this.registry.decode(msg);
      if (
        [
          '/cosmwasm.wasm.v1.MsgExecuteContract',
          '/cosmwasm.wasm.v1.MsgMigrateContract',
          '/cosmwasm.wasm.v1.MsgInstantiateContract',
        ].includes(msg.typeUrl)
      ) {
        decodedMsg.msg = JSON.parse(new TextDecoder().decode(decodedMsg.msg));
      }
      return decodedMsg;
    } catch (e) {
      logger.error(e, 'Failed to decode message');
      throw e;
    }
  }

  static handleError(e: Error): Error {
    const formatted_error: Error = e;
    try {
      const message = JSON.parse(e.message);
      if (
        message.data &&
        message.data.includes(`is not available, lowest height is`)
      ) {
        formatted_error.message = `${message.data}\nINFO: This most likely means the provided endpoint is a pruned node. An archive/full node is needed to access historical data`;
      }
    } catch (err) {
      if (e.message === 'Request failed with status code 429') {
        formatted_error.name = 'RateLimitError';
      } else if (e.message === 'Request failed with status code 403') {
        formatted_error.name = 'Forbidden';
      }
    }
    return formatted_error;
  }
}

// TODO make this class not exported and expose interface instead
export class CosmosSafeClient extends CosmWasmClient {
  height: number;

  constructor(tmClient: Tendermint34Client, height: number) {
    super(tmClient);
    this.height = height;
  }

  // Deprecate
  async getBlock(): Promise<Block> {
    const response = await this.forceGetTmClient().block(this.height);
    return {
      id: toHex(response.blockId.hash).toUpperCase(),
      header: {
        version: {
          block: new Uint53(response.block.header.version.block).toString(),
          app: new Uint53(response.block.header.version.app).toString(),
        },
        height: response.block.header.height,
        chainId: response.block.header.chainId,
        time: toRfc3339WithNanoseconds(response.block.header.time),
      },
      txs: response.block.txs,
    };
  }

  async validators(): Promise<readonly Validator[]> {
    return (
      await this.forceGetTmClient().validators({
        height: this.height,
      })
    ).validators;
  }

  async searchTx(): Promise<readonly IndexedTx[]> {
    const txs: readonly IndexedTx[] = await this.safeTxsQuery(
      `tx.height=${this.height}`,
    );
    return txs;
  }

  private async safeTxsQuery(query: string): Promise<readonly IndexedTx[]> {
    const results = await this.forceGetTmClient().txSearchAll({ query: query });
    return results.txs.map((tx) => {
      return {
        height: tx.height,
        hash: toHex(tx.hash).toUpperCase(),
        code: tx.result.code,
        rawLog: tx.result.log || '',
        tx: tx.tx,
        gasUsed: tx.result.gasUsed,
        gasWanted: tx.result.gasWanted,
        events: tx.result.events.map((evt) => ({
          ...evt,
          attributes: evt.attributes.map((attr) => ({
            key: Buffer.from(attr.key).toString('utf8'),
            value: Buffer.from(attr.value).toString('utf8'),
          })),
        })),
      };
    });
  }
}
