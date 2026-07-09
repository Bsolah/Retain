import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { GraphQLContext } from '../context.js';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** Loose JSON object for policy payloads. */
  JSON: { input: any; output: any; }
};

export type BoxConfig = {
  __typename?: 'BoxConfig';
  allowSwaps?: Maybe<Scalars['Boolean']['output']>;
  eligibleProductIds?: Maybe<Array<Scalars['ID']['output']>>;
  maxItems?: Maybe<Scalars['Int']['output']>;
  minItems?: Maybe<Scalars['Int']['output']>;
  slots?: Maybe<Array<BoxSlotConfig>>;
};

export type BoxConfigInput = {
  allowSwaps?: InputMaybe<Scalars['Boolean']['input']>;
  eligibleProductIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  maxItems?: InputMaybe<Scalars['Int']['input']>;
  minItems?: InputMaybe<Scalars['Int']['input']>;
  slots?: InputMaybe<Array<BoxSlotConfigInput>>;
};

export type BoxItem = {
  __typename?: 'BoxItem';
  productId: Scalars['ID']['output'];
  quantity: Scalars['Int']['output'];
  slot?: Maybe<Scalars['String']['output']>;
  variantId: Scalars['ID']['output'];
};

export type BoxItemInput = {
  productId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
  slot?: InputMaybe<Scalars['String']['input']>;
  variantId: Scalars['ID']['input'];
};

export type BoxSlotConfig = {
  __typename?: 'BoxSlotConfig';
  id: Scalars['String']['output'];
  label?: Maybe<Scalars['String']['output']>;
  required?: Maybe<Scalars['Boolean']['output']>;
};

export type BoxSlotConfigInput = {
  id: Scalars['String']['input'];
  label?: InputMaybe<Scalars['String']['input']>;
  required?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ContractStatus =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'paused'
  | 'payment_failed';

export type FrequencyUnit =
  | 'day'
  | 'month'
  | 'week'
  | 'year';

/** API health payload. */
export type Health = {
  __typename?: 'Health';
  status: Scalars['String']['output'];
  timestamp: Scalars['String']['output'];
  version: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  archivePlan: SubscriptionPlan;
  /** Merchant: cancel with optional minimum-commitment override. */
  cancelContract: SubscriptionContract;
  createPlan: SubscriptionPlan;
  /** Customer portal: cancel with survey feedback. */
  customerCancelContract: SubscriptionContract;
  /** Customer portal: pause. */
  customerPauseContract: SubscriptionContract;
  /** Customer portal: skip next delivery (max 2 consecutive). */
  customerSkipNextDelivery: SubscriptionContract;
  /** Customer portal: swap primary product/variant. */
  customerSwapProduct: SubscriptionContract;
  /** Customer portal: update box contents. */
  customerUpdateBoxItems: SubscriptionContract;
  /** Permanently remove a plan with no subscribers (also removes Shopify selling plan group). */
  deletePlan: SubscriptionPlan;
  /** Merchant: pause for N days. */
  pauseContract: SubscriptionContract;
  /** Merchant: resume a paused contract. */
  resumeContract: SubscriptionContract;
  /** Re-sync an existing plan's selling plans to Shopify (fixes storefront names/counts). */
  resyncPlan: SubscriptionPlan;
  /** Merchant: bill immediately. */
  runNow: SubscriptionContract;
  unarchivePlan: SubscriptionPlan;
  /** Merchant: update contract fields. */
  updateContract: SubscriptionContract;
  updatePlan: SubscriptionPlan;
};


export type MutationArchivePlanArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCancelContractArgs = {
  id: Scalars['ID']['input'];
  merchantOverride?: InputMaybe<Scalars['Boolean']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  reason: Scalars['String']['input'];
};


export type MutationCreatePlanArgs = {
  input: PlanInput;
};


export type MutationCustomerCancelContractArgs = {
  contractId: Scalars['ID']['input'];
  feedback?: InputMaybe<Scalars['String']['input']>;
  reason: Scalars['String']['input'];
};


export type MutationCustomerPauseContractArgs = {
  contractId: Scalars['ID']['input'];
  duration: Scalars['Int']['input'];
};


export type MutationCustomerSkipNextDeliveryArgs = {
  contractId: Scalars['ID']['input'];
};


export type MutationCustomerSwapProductArgs = {
  contractId: Scalars['ID']['input'];
  newProductId: Scalars['ID']['input'];
  newVariantId: Scalars['ID']['input'];
};


export type MutationCustomerUpdateBoxItemsArgs = {
  contractId: Scalars['ID']['input'];
  items: Array<BoxItemInput>;
};


export type MutationDeletePlanArgs = {
  id: Scalars['ID']['input'];
};


export type MutationPauseContractArgs = {
  duration: Scalars['Int']['input'];
  id: Scalars['ID']['input'];
};


export type MutationResumeContractArgs = {
  id: Scalars['ID']['input'];
};


export type MutationResyncPlanArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRunNowArgs = {
  id: Scalars['ID']['input'];
};


export type MutationUnarchivePlanArgs = {
  id: Scalars['ID']['input'];
};


export type MutationUpdateContractArgs = {
  id: Scalars['ID']['input'];
  input: UpdateContractInput;
};


export type MutationUpdatePlanArgs = {
  id: Scalars['ID']['input'];
  input: PlanInput;
};

export type PlanFrequency = {
  __typename?: 'PlanFrequency';
  discountPercent?: Maybe<Scalars['Float']['output']>;
  interval: Scalars['Int']['output'];
  /** Prepaid only: bill every N units (same unit as interval). Must be >= interval. */
  prepaidBillingInterval?: Maybe<Scalars['Int']['output']>;
  unit: FrequencyUnit;
};

export type PlanFrequencyInput = {
  discountPercent?: InputMaybe<Scalars['Float']['input']>;
  interval: Scalars['Int']['input'];
  prepaidBillingInterval?: InputMaybe<Scalars['Int']['input']>;
  unit: FrequencyUnit;
};

export type PlanInput = {
  boxConfig?: InputMaybe<BoxConfigInput>;
  collectionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  description?: InputMaybe<Scalars['String']['input']>;
  frequencies: Array<PlanFrequencyInput>;
  name: Scalars['String']['input'];
  planType: PlanType;
  productIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type PlanStatus =
  | 'active'
  | 'archived'
  | 'paused';

export type PlanType =
  | 'box'
  | 'prepaid'
  | 'standard';

export type Query = {
  __typename?: 'Query';
  /** List collections for the authenticated shop. */
  collections: Array<ShopifyCollection>;
  /** Liveness probe for the GraphQL API. */
  health: Health;
  /** Fetch a single subscription plan. */
  plan?: Maybe<SubscriptionPlan>;
  /** List subscription plans for a shop. */
  plans: Array<SubscriptionPlan>;
  /** Search products in the authenticated shop catalog. */
  searchProducts: Array<ShopifyProduct>;
  /** Whether the Retain subscribe block is enabled on the live theme. */
  storefrontWidget: StorefrontWidget;
};


export type QueryCollectionsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryPlanArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPlansArgs = {
  shopId: Scalars['ID']['input'];
  status?: InputMaybe<PlanStatus>;
};


export type QuerySearchProductsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  query: Scalars['String']['input'];
};

export type ShopifyCollection = {
  __typename?: 'ShopifyCollection';
  handle: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  title: Scalars['String']['output'];
};

export type ShopifyProduct = {
  __typename?: 'ShopifyProduct';
  featuredImageUrl?: Maybe<Scalars['String']['output']>;
  handle: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  variants: Array<ShopifyProductVariant>;
};

export type ShopifyProductVariant = {
  __typename?: 'ShopifyProductVariant';
  id: Scalars['ID']['output'];
  price: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

export type StorefrontWidget = {
  __typename?: 'StorefrontWidget';
  blockHandle: Scalars['String']['output'];
  deepLinkUrl: Scalars['String']['output'];
  /** How subscribe options are shown on the product page, when active. */
  source?: Maybe<StorefrontWidgetSource>;
  status: StorefrontWidgetStatus;
  themeName?: Maybe<Scalars['String']['output']>;
};

export type StorefrontWidgetSource =
  | 'retain_block'
  | 'theme_native';

export type StorefrontWidgetStatus =
  | 'active'
  | 'inactive'
  | 'unknown';

export type SubscriptionContract = {
  __typename?: 'SubscriptionContract';
  billingPolicy?: Maybe<Scalars['JSON']['output']>;
  boxItems?: Maybe<Array<BoxItem>>;
  cancellationNotes?: Maybe<Scalars['String']['output']>;
  cancellationReason?: Maybe<Scalars['String']['output']>;
  cancelledAt?: Maybe<Scalars['String']['output']>;
  consecutiveSkips: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  customerId: Scalars['ID']['output'];
  deliveryPolicy?: Maybe<Scalars['JSON']['output']>;
  id: Scalars['ID']['output'];
  lastBillingAttemptId?: Maybe<Scalars['String']['output']>;
  lastBillingDate?: Maybe<Scalars['String']['output']>;
  lineItems?: Maybe<Array<BoxItem>>;
  nextBillingDate?: Maybe<Scalars['String']['output']>;
  planId: Scalars['ID']['output'];
  pricingPolicy?: Maybe<Scalars['JSON']['output']>;
  resumeDate?: Maybe<Scalars['String']['output']>;
  shopId: Scalars['ID']['output'];
  shopifyContractId: Scalars['String']['output'];
  status: ContractStatus;
  totalCharges: Scalars['Int']['output'];
  totalRevenue: Scalars['Float']['output'];
  updatedAt: Scalars['String']['output'];
};

export type SubscriptionPlan = {
  __typename?: 'SubscriptionPlan';
  boxConfig?: Maybe<BoxConfig>;
  collectionIds: Array<Scalars['ID']['output']>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  frequencies: Array<PlanFrequency>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  planType: PlanType;
  productIds: Array<Scalars['ID']['output']>;
  revenue: Scalars['Float']['output'];
  shopId: Scalars['ID']['output'];
  shopifySellingPlanGroupId?: Maybe<Scalars['String']['output']>;
  status: PlanStatus;
  subscriberCount: Scalars['Int']['output'];
  updatedAt: Scalars['String']['output'];
};

export type UpdateContractInput = {
  boxItems?: InputMaybe<Array<BoxItemInput>>;
  nextBillingDate?: InputMaybe<Scalars['String']['input']>;
  pauseDuration?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<ContractStatus>;
};

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  BoxConfig: ResolverTypeWrapper<BoxConfig>;
  BoxConfigInput: BoxConfigInput;
  BoxItem: ResolverTypeWrapper<BoxItem>;
  BoxItemInput: BoxItemInput;
  BoxSlotConfig: ResolverTypeWrapper<BoxSlotConfig>;
  BoxSlotConfigInput: BoxSlotConfigInput;
  ContractStatus: ContractStatus;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  FrequencyUnit: FrequencyUnit;
  Health: ResolverTypeWrapper<Health>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  Mutation: ResolverTypeWrapper<{}>;
  PlanFrequency: ResolverTypeWrapper<PlanFrequency>;
  PlanFrequencyInput: PlanFrequencyInput;
  PlanInput: PlanInput;
  PlanStatus: PlanStatus;
  PlanType: PlanType;
  Query: ResolverTypeWrapper<{}>;
  ShopifyCollection: ResolverTypeWrapper<ShopifyCollection>;
  ShopifyProduct: ResolverTypeWrapper<ShopifyProduct>;
  ShopifyProductVariant: ResolverTypeWrapper<ShopifyProductVariant>;
  StorefrontWidget: ResolverTypeWrapper<StorefrontWidget>;
  StorefrontWidgetSource: StorefrontWidgetSource;
  StorefrontWidgetStatus: StorefrontWidgetStatus;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  SubscriptionContract: ResolverTypeWrapper<SubscriptionContract>;
  SubscriptionPlan: ResolverTypeWrapper<SubscriptionPlan>;
  UpdateContractInput: UpdateContractInput;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Boolean: Scalars['Boolean']['output'];
  BoxConfig: BoxConfig;
  BoxConfigInput: BoxConfigInput;
  BoxItem: BoxItem;
  BoxItemInput: BoxItemInput;
  BoxSlotConfig: BoxSlotConfig;
  BoxSlotConfigInput: BoxSlotConfigInput;
  Float: Scalars['Float']['output'];
  Health: Health;
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  Mutation: {};
  PlanFrequency: PlanFrequency;
  PlanFrequencyInput: PlanFrequencyInput;
  PlanInput: PlanInput;
  Query: {};
  ShopifyCollection: ShopifyCollection;
  ShopifyProduct: ShopifyProduct;
  ShopifyProductVariant: ShopifyProductVariant;
  StorefrontWidget: StorefrontWidget;
  String: Scalars['String']['output'];
  SubscriptionContract: SubscriptionContract;
  SubscriptionPlan: SubscriptionPlan;
  UpdateContractInput: UpdateContractInput;
}>;

export type BoxConfigResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['BoxConfig'] = ResolversParentTypes['BoxConfig']> = ResolversObject<{
  allowSwaps?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  eligibleProductIds?: Resolver<Maybe<Array<ResolversTypes['ID']>>, ParentType, ContextType>;
  maxItems?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  minItems?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  slots?: Resolver<Maybe<Array<ResolversTypes['BoxSlotConfig']>>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type BoxItemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['BoxItem'] = ResolversParentTypes['BoxItem']> = ResolversObject<{
  productId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  quantity?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  slot?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  variantId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type BoxSlotConfigResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['BoxSlotConfig'] = ResolversParentTypes['BoxSlotConfig']> = ResolversObject<{
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  label?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  required?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type HealthResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Health'] = ResolversParentTypes['Health']> = ResolversObject<{
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  version?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type MutationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  archivePlan?: Resolver<ResolversTypes['SubscriptionPlan'], ParentType, ContextType, RequireFields<MutationArchivePlanArgs, 'id'>>;
  cancelContract?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationCancelContractArgs, 'id' | 'reason'>>;
  createPlan?: Resolver<ResolversTypes['SubscriptionPlan'], ParentType, ContextType, RequireFields<MutationCreatePlanArgs, 'input'>>;
  customerCancelContract?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationCustomerCancelContractArgs, 'contractId' | 'reason'>>;
  customerPauseContract?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationCustomerPauseContractArgs, 'contractId' | 'duration'>>;
  customerSkipNextDelivery?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationCustomerSkipNextDeliveryArgs, 'contractId'>>;
  customerSwapProduct?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationCustomerSwapProductArgs, 'contractId' | 'newProductId' | 'newVariantId'>>;
  customerUpdateBoxItems?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationCustomerUpdateBoxItemsArgs, 'contractId' | 'items'>>;
  deletePlan?: Resolver<ResolversTypes['SubscriptionPlan'], ParentType, ContextType, RequireFields<MutationDeletePlanArgs, 'id'>>;
  pauseContract?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationPauseContractArgs, 'duration' | 'id'>>;
  resumeContract?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationResumeContractArgs, 'id'>>;
  resyncPlan?: Resolver<ResolversTypes['SubscriptionPlan'], ParentType, ContextType, RequireFields<MutationResyncPlanArgs, 'id'>>;
  runNow?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationRunNowArgs, 'id'>>;
  unarchivePlan?: Resolver<ResolversTypes['SubscriptionPlan'], ParentType, ContextType, RequireFields<MutationUnarchivePlanArgs, 'id'>>;
  updateContract?: Resolver<ResolversTypes['SubscriptionContract'], ParentType, ContextType, RequireFields<MutationUpdateContractArgs, 'id' | 'input'>>;
  updatePlan?: Resolver<ResolversTypes['SubscriptionPlan'], ParentType, ContextType, RequireFields<MutationUpdatePlanArgs, 'id' | 'input'>>;
}>;

export type PlanFrequencyResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['PlanFrequency'] = ResolversParentTypes['PlanFrequency']> = ResolversObject<{
  discountPercent?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  interval?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  prepaidBillingInterval?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  unit?: Resolver<ResolversTypes['FrequencyUnit'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  collections?: Resolver<Array<ResolversTypes['ShopifyCollection']>, ParentType, ContextType, RequireFields<QueryCollectionsArgs, 'first'>>;
  health?: Resolver<ResolversTypes['Health'], ParentType, ContextType>;
  plan?: Resolver<Maybe<ResolversTypes['SubscriptionPlan']>, ParentType, ContextType, RequireFields<QueryPlanArgs, 'id'>>;
  plans?: Resolver<Array<ResolversTypes['SubscriptionPlan']>, ParentType, ContextType, RequireFields<QueryPlansArgs, 'shopId'>>;
  searchProducts?: Resolver<Array<ResolversTypes['ShopifyProduct']>, ParentType, ContextType, RequireFields<QuerySearchProductsArgs, 'first' | 'query'>>;
  storefrontWidget?: Resolver<ResolversTypes['StorefrontWidget'], ParentType, ContextType>;
}>;

export type ShopifyCollectionResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ShopifyCollection'] = ResolversParentTypes['ShopifyCollection']> = ResolversObject<{
  handle?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ShopifyProductResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ShopifyProduct'] = ResolversParentTypes['ShopifyProduct']> = ResolversObject<{
  featuredImageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  handle?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  variants?: Resolver<Array<ResolversTypes['ShopifyProductVariant']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ShopifyProductVariantResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ShopifyProductVariant'] = ResolversParentTypes['ShopifyProductVariant']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type StorefrontWidgetResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['StorefrontWidget'] = ResolversParentTypes['StorefrontWidget']> = ResolversObject<{
  blockHandle?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  deepLinkUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  source?: Resolver<Maybe<ResolversTypes['StorefrontWidgetSource']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StorefrontWidgetStatus'], ParentType, ContextType>;
  themeName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SubscriptionContractResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SubscriptionContract'] = ResolversParentTypes['SubscriptionContract']> = ResolversObject<{
  billingPolicy?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  boxItems?: Resolver<Maybe<Array<ResolversTypes['BoxItem']>>, ParentType, ContextType>;
  cancellationNotes?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  cancellationReason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  cancelledAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  consecutiveSkips?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  customerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  deliveryPolicy?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastBillingAttemptId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lastBillingDate?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lineItems?: Resolver<Maybe<Array<ResolversTypes['BoxItem']>>, ParentType, ContextType>;
  nextBillingDate?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  planId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  pricingPolicy?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  resumeDate?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  shopId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  shopifyContractId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['ContractStatus'], ParentType, ContextType>;
  totalCharges?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalRevenue?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SubscriptionPlanResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SubscriptionPlan'] = ResolversParentTypes['SubscriptionPlan']> = ResolversObject<{
  boxConfig?: Resolver<Maybe<ResolversTypes['BoxConfig']>, ParentType, ContextType>;
  collectionIds?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  frequencies?: Resolver<Array<ResolversTypes['PlanFrequency']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  planType?: Resolver<ResolversTypes['PlanType'], ParentType, ContextType>;
  productIds?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
  revenue?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  shopId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  shopifySellingPlanGroupId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['PlanStatus'], ParentType, ContextType>;
  subscriberCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = GraphQLContext> = ResolversObject<{
  BoxConfig?: BoxConfigResolvers<ContextType>;
  BoxItem?: BoxItemResolvers<ContextType>;
  BoxSlotConfig?: BoxSlotConfigResolvers<ContextType>;
  Health?: HealthResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  PlanFrequency?: PlanFrequencyResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  ShopifyCollection?: ShopifyCollectionResolvers<ContextType>;
  ShopifyProduct?: ShopifyProductResolvers<ContextType>;
  ShopifyProductVariant?: ShopifyProductVariantResolvers<ContextType>;
  StorefrontWidget?: StorefrontWidgetResolvers<ContextType>;
  SubscriptionContract?: SubscriptionContractResolvers<ContextType>;
  SubscriptionPlan?: SubscriptionPlanResolvers<ContextType>;
}>;

