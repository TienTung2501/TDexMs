const fs = require('fs');

let code = fs.readFileSync('src/lib/hooks.ts', 'utf8');

// The original useApi block
const oldHook = `function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options?: { enabled?: boolean; fallback?: T; refetchInterval?: number }
) {
  const isEnabled = options?.enabled !== false;
  
  const { data, error, isLoading, isRefetching, refetch } = useQuery({
    queryKey: deps,
    queryFn: fetcher,
    enabled: isEnabled,
    refetchInterval: options?.refetchInterval ?? false,
    initialData: options?.fallback,
  });

  return {
    data: !isEnabled ? options?.fallback : data,
    loading: isLoading,
    isRefetching,
    error,
    refetch,
  };
}`;

const newHook = `function useApi<T>(
  queryKey: unknown[],
  fetcher: () => Promise<T>,
  options?: { enabled?: boolean; fallback?: T; refetchInterval?: number }
) {
  const isEnabled = options?.enabled !== false;
  
  const { data, error, isLoading, isRefetching, refetch } = useQuery({
    queryKey,
    queryFn: fetcher,
    enabled: isEnabled,
    refetchInterval: options?.refetchInterval ?? false,
    initialData: options?.fallback,
  });

  return {
    data: !isEnabled ? options?.fallback : data,
    loading: isLoading,
    isRefetching,
    error,
    refetch,
  };
}`;

code = code.replace(oldHook, newHook);

// Now search for all `useApi<TYPE>( () => ..., deps, options)` 
// and change to `useApi<TYPE>(['hookName', ...deps], () => ..., options)`
const regex = /(useApi<.+?>)\(\n?\s*(\(.*?\)\s*=>\s*[\s\S]*?(?:,|(?=\n\s*\[)))\s*(\[.*?\])(,\s*\{[\s\S]*?\})?\s*\)/g;

let match;
while ((match = regex.exec(code)) !== null) {
  code = code.substring(0, match.index) +
         match[1] + "(" + match[3] + ", " + match[2].replace(/,\s*$/, "") + (match[4] || "") + ")" +
         code.substring(match.index + match[0].length);
  regex.lastIndex = 0; // reset because string length changed
}

fs.writeFileSync('src/lib/hooks.ts', code);
