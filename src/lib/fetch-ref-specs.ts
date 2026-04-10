export type GitRef = `refs/${string}`;
export type FetchRefSpec = `${'' | '+'}${GitRef}:${GitRef}`;

const RE_GITREF = /^refs\/[^:\s]+$/;
const RE_FETCH_REFSPEC = /^\+?refs\/[^:\s]+:refs\/[^:\s]+$/;

export function isGitRef(arg: unknown): arg is GitRef {
  return typeof arg === 'string' && RE_GITREF.test(arg);
}
export function isFetchRefSpec(arg: unknown): arg is FetchRefSpec {
  return typeof arg === 'string' && RE_FETCH_REFSPEC.test(arg);
}

export function toFetchRefSpec(ref: string): FetchRefSpec | undefined {
  return isFetchRefSpec(ref) ? ref : isGitRef(ref) ? `+${ref}:${ref}` : undefined;
}