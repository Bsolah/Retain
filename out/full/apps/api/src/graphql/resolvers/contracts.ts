import type { GraphQLContext } from '../../context.js';
import {
  cancelContract,
  pauseContract,
  resumeContract,
  runNow,
  skipNextDelivery,
  swapProduct,
  updateBoxItems,
  updateContract,
} from '../../services/contract-manager.js';
import { requireCustomerContract, requireMerchantContract } from '../auth.js';
import { mapContractToGql } from '../contract-mapper.js';

type BoxItemInput = {
  productId: string;
  variantId: string;
  quantity: number;
  slot?: string | null;
};

export const contractMutations = {
  updateContract: async (
    _parent: unknown,
    args: {
      id: string;
      input: {
        status?: string | null;
        nextBillingDate?: string | null;
        boxItems?: BoxItemInput[] | null;
        pauseDuration?: number | null;
      };
    },
    context: GraphQLContext,
  ) => {
    await requireMerchantContract(context, args.id);
    const contract = await updateContract({
      id: args.id,
      input: args.input,
      actor: 'merchant',
      merchantOverride: true,
    });
    return mapContractToGql(contract);
  },

  cancelContract: async (
    _parent: unknown,
    args: {
      id: string;
      reason: string;
      notes?: string | null;
      merchantOverride?: boolean | null;
    },
    context: GraphQLContext,
  ) => {
    await requireMerchantContract(context, args.id);
    const contract = await cancelContract({
      id: args.id,
      reason: args.reason,
      notes: args.notes,
      actor: 'merchant',
      merchantOverride: args.merchantOverride ?? false,
    });
    return mapContractToGql(contract);
  },

  pauseContract: async (
    _parent: unknown,
    args: { id: string; duration: number },
    context: GraphQLContext,
  ) => {
    await requireMerchantContract(context, args.id);
    const contract = await pauseContract({
      id: args.id,
      durationDays: args.duration,
      actor: 'merchant',
    });
    return mapContractToGql(contract);
  },

  resumeContract: async (
    _parent: unknown,
    args: { id: string },
    context: GraphQLContext,
  ) => {
    await requireMerchantContract(context, args.id);
    const contract = await resumeContract({
      id: args.id,
      actor: 'merchant',
    });
    return mapContractToGql(contract);
  },

  runNow: async (
    _parent: unknown,
    args: { id: string },
    context: GraphQLContext,
  ) => {
    await requireMerchantContract(context, args.id);
    const contract = await runNow({ id: args.id, actor: 'merchant' });
    return mapContractToGql(contract);
  },

  customerPauseContract: async (
    _parent: unknown,
    args: { contractId: string; duration: number },
    context: GraphQLContext,
  ) => {
    await requireCustomerContract(context, args.contractId);
    const contract = await pauseContract({
      id: args.contractId,
      durationDays: args.duration,
      actor: 'customer',
    });
    return mapContractToGql(contract);
  },

  customerSkipNextDelivery: async (
    _parent: unknown,
    args: { contractId: string },
    context: GraphQLContext,
  ) => {
    await requireCustomerContract(context, args.contractId);
    const contract = await skipNextDelivery({
      id: args.contractId,
      actor: 'customer',
    });
    return mapContractToGql(contract);
  },

  customerSwapProduct: async (
    _parent: unknown,
    args: {
      contractId: string;
      newProductId: string;
      newVariantId: string;
    },
    context: GraphQLContext,
  ) => {
    await requireCustomerContract(context, args.contractId);
    const contract = await swapProduct({
      id: args.contractId,
      newProductId: args.newProductId,
      newVariantId: args.newVariantId,
      actor: 'customer',
    });
    return mapContractToGql(contract);
  },

  customerUpdateBoxItems: async (
    _parent: unknown,
    args: { contractId: string; items: BoxItemInput[] },
    context: GraphQLContext,
  ) => {
    await requireCustomerContract(context, args.contractId);
    const contract = await updateBoxItems({
      id: args.contractId,
      items: args.items,
      actor: 'customer',
    });
    return mapContractToGql(contract);
  },

  customerCancelContract: async (
    _parent: unknown,
    args: {
      contractId: string;
      reason: string;
      feedback?: string | null;
    },
    context: GraphQLContext,
  ) => {
    await requireCustomerContract(context, args.contractId);
    const contract = await cancelContract({
      id: args.contractId,
      reason: args.reason,
      feedback: args.feedback,
      actor: 'customer',
      merchantOverride: false,
    });
    return mapContractToGql(contract);
  },
};
