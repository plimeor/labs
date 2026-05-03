export type RepositoryRequest = {
  commit?: string
  ref?: string
  source: string
}

export function repositoryRequestKey(request: RepositoryRequest): string {
  return [request.source, repositoryRequestRef(request) ?? 'HEAD'].join('\0')
}

export function repositoryRequestRef(request: RepositoryRequest): string | undefined {
  return request.commit ?? request.ref
}
