// A trimmed subset of GitHub's linguist language colors. Enough to cover the
// vast majority of repos; anything unknown falls back to a neutral gray.
// Source of truth for the full list: github/linguist (languages.yml).

export const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Lua: '#000080',
  R: '#198CE7',
  Julia: '#a270ba',
  'Objective-C': '#438eff',
  Perl: '#0298c3',
  Clojure: '#db5855',
  Erlang: '#B83998',
  'Jupyter Notebook': '#DA5B0B',
  MATLAB: '#e16737',
  PowerShell: '#012456',
  Zig: '#ec915c',
  Solidity: '#AA6746',
  Nix: '#7e7eff',
  OCaml: '#3be133',
  Assembly: '#6E4C13',
  Vim: '#199f4b',
  Makefile: '#427819',
  Dockerfile: '#384d54',
}

/** Neutral fallback for repos with no detected / unknown language. */
export const UNKNOWN_LANGUAGE_COLOR = '#9aa4b2'

export function colorForLanguage(language: string | null): string {
  if (!language) return UNKNOWN_LANGUAGE_COLOR
  return LANGUAGE_COLORS[language] ?? UNKNOWN_LANGUAGE_COLOR
}
