#!/usr/bin/env bash
# shopify-app-kit v0.17.7
# hooks/lib.sh: shared helpers for the shopify-app-kit guard hooks. Sourced, never executed.
# Vendored into consumers at .claude/hooks/kit/lib.sh by /shopify-app-kit:sync, next to the guards.
#
# Contract for a guard that sources this file:
#   KIT_HOOK_NAME=guard-something; . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
#   kit_read_input            -> $input (raw hook JSON from stdin)
#   kit_parse_input           -> $cmd (tool_input.command), $tool (tool_name), $cwd (absolute)   [needs jq]
#                                and $cmd_bare ($cmd without quotes and backslashes, for a guard's substring pre-filter)
#   kit_tool_arg KEY          -> tool_input.KEY as text, or nothing (an MCP tool's argument)   [needs jq]
#   kit_raw_tool              -> tool_name without jq, or nothing
#   kit_raw_command           -> tool_input.command without jq, JSON-escaped (the whole payload when it has none)
#   kit_raw_words             -> kit_raw_command as words two spaces apart, for a no-jq pre-filter (over-matches)
#   kit_resolve_manifest DIR  -> $manifest, $root (the CONSUMER repo root)
#   kit_manifest_ok           -> 0 when the manifest is readable and kit.schemaVersion == 1
#   mf JQ_FILTER              -> jq -r over the manifest
#   block REASON RULE         -> standard block message on stderr, exit 2
#   kit_require_jq WHAT       -> block when jq is missing ("jq is not installed, so WHAT (fail closed)")
#   kit_require_manifest [DIR]-> resolve the manifest and block when it is missing or unreadable
#   kit_ensure_manifest       -> the lazy form: 0 the first time (read your keys now), 1 once loaded
#   kit_fail_closed_on_exit   -> a guard's net: any exit other than 0 or 2 (the guard itself failed) becomes a block
#   kit_walk_commands CMD CB  -> calls CB "<effective dir>" <prog> <args...> for every simple command in CMD, as the
#                                shell would read it (an awk lexer), with cd/pushd/popd tracking   [needs awk]

KIT_VERSION="0.17.7"
KIT_HOOK_NAME="${KIT_HOOK_NAME:-hook}"
KIT_MANIFEST_RULE="Add or repair .claude/shopify-app.json (the repo manifest the kit's guard hooks read; schema: shopify-app-kit schemas/shopify-app.v1.schema.json)."

manifest=""
root=""
input=""
cmd=""
cmd_bare=""
tool=""
cwd=""

# ---------------------------------------------------------------- blocking

block() {
  printf 'Blocked by shopify-app-kit/%s: %s.\n%s\nCases: shopify-app-kit test/hooks.test.mjs (v%s).\n' \
    "$KIT_HOOK_NAME" "$1" "$2" "$KIT_VERSION" >&2
  exit 2
}

# ---------------------------------------------------------------- hook input

kit_read_input() { input="$(cat 2>/dev/null || true)"; }

kit_has_jq() { command -v jq >/dev/null 2>&1; }

kit_parse_input() {
  cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null || true)"
  tool="$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null || true)"
  cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null || true)"
  [ -n "$cwd" ] || cwd="$PWD"
  case "$cwd" in /*) ;; *) cwd="$PWD/$cwd" ;; esac
  # word splitting on the three characters, then a join on nothing: linear, where ${cmd//...} is not on bash 3.2
  local IFS=\''"\\' ; set -f; local -a p=($cmd); set +f; IFS=""; cmd_bare="${p[*]+"${p[*]}"}"
}

kit_tool_arg() { jq -r --arg k "$1" '.tool_input[$k] // empty | tostring' <<<"$input" 2>/dev/null || true; }

kit_raw_tool() { printf '%s' "$input" | sed -E -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"([^"\\]*)".*/\1/p'; }

# kit_raw_command: tool_input.command without jq, JSON-escaped as it sits in the payload (a substring test on it is
# as good as one on the parsed command); the whole payload when no command key is found, so an unknown shape still
# fails closed on the guards' words rather than open. The no-jq pre-filters match this, never $input, whose cwd
# would otherwise decide (#38).
kit_raw_command() {
  local c; c="$(printf '%s' "$input" | sed -E -n 's/.*"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p')"
  printf '%s' "${c:-$input}"
}

# kit_raw_words: kit_raw_command as words two spaces apart (JSON escapes, quotes, slashes and shell operators split
# them), so *" git "*" push "* matches `git -C . push`, `git<TAB>push`, `/usr/bin/git push` and `x;git push` alike.
# Over-matches on purpose (no jq: refuse a mention, never miss a command); LC_ALL=C keeps BSD sed off non-UTF-8 bytes.
kit_raw_words() {
  local w; w="$(kit_raw_command | tr '\n' ' ' | LC_ALL=C sed -E 's/\\[tnr"]/ /g; s/[^A-Za-z0-9._:@+=-]+/ /g; s/ /  /g')"
  [ -n "$w" ] || { w="$(kit_raw_command)"; w="${w// /  }"; }
  printf '  %s  ' "$w"
}

# ---------------------------------------------------------------- manifest resolution

# kit_find_manifest_upward DIR: print the nearest DIR/.claude/shopify-app.json walking up, or nothing.
kit_find_manifest_upward() {
  local d="$1"
  [ -n "$d" ] || return 1
  while :; do
    if [ -f "$d/.claude/shopify-app.json" ]; then printf '%s' "$d/.claude/shopify-app.json"; return 0; fi
    case "$d" in / | "" | .) return 1 ;; esac
    d="$(dirname "$d")"
  done
}

# kit_resolve_manifest [START_DIR]: set $manifest and $root.
#   $SHOPIFY_APP_KIT_MANIFEST wins (tests, unusual layouts), then $CLAUDE_PROJECT_DIR/.claude/shopify-app.json,
#   then a walk up from START_DIR (default: $PWD). The consumer root is the manifest's grandparent when the manifest
#   sits at <repo>/.claude/shopify-app.json, else $SHOPIFY_APP_KIT_ROOT / $CLAUDE_PROJECT_DIR / the manifest's directory.
kit_resolve_manifest() {
  local start="${1:-$PWD}" found
  if [ -n "${SHOPIFY_APP_KIT_MANIFEST:-}" ]; then
    manifest="$SHOPIFY_APP_KIT_MANIFEST"
  elif [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    manifest="$CLAUDE_PROJECT_DIR/.claude/shopify-app.json"
  else
    found="$(kit_find_manifest_upward "$start" || true)"
    manifest="${found:-$start/.claude/shopify-app.json}"
  fi
  case "$manifest" in /*) ;; *) manifest="$PWD/$manifest" ;; esac
  if [ -n "${SHOPIFY_APP_KIT_ROOT:-}" ]; then
    root="$SHOPIFY_APP_KIT_ROOT"
  else
    case "$manifest" in
      */.claude/shopify-app.json) root="${manifest%/.claude/shopify-app.json}" ;;
      *) root="${CLAUDE_PROJECT_DIR:-$(dirname "$manifest")}" ;;
    esac
  fi
  [ -n "$root" ] || root="/"
  if [ -d "$root" ]; then root="$(cd "$root" 2>/dev/null && pwd -P)"; else root="$(kit_norm_path "$root")"; fi
}

kit_manifest_ok() {
  [ -r "$manifest" ] && jq -e '.kit.schemaVersion == 1' "$manifest" >/dev/null 2>&1
}

mf() { jq -r "$1" "$manifest"; }

# ---------------------------------------------------------------- fail-closed prologue

KIT_JQ_RULE="Install jq (brew install jq / apt-get install jq)."
KIT_GUARD_RULE="The error above is the guard's, not the command's: check bash, jq, sed, awk and git on PATH, then re-run /shopify-app-kit:sync."
manifest_loaded=0

# kit_require_jq WHAT: block when jq is missing, naming what could not be inspected without it.
kit_require_jq() { kit_has_jq || block "jq is not installed, so $1 (fail closed)" "$KIT_JQ_RULE"; }

# kit_require_manifest [START_DIR]: resolve the manifest and block when it is missing or unreadable.
kit_require_manifest() {
  kit_resolve_manifest "${1:-$cwd}"
  kit_manifest_ok || block "the repo manifest is missing or unreadable ($manifest), so the command cannot be checked (fail closed)" "$KIT_MANIFEST_RULE"
}

# kit_ensure_manifest: for a guard that reads the manifest only once a guarded form is seen (so a command that
# merely mentions its tool in prose never needs one). Returns 0 the first time, when the caller reads its keys,
# and 1 on every later call.
kit_ensure_manifest() {
  [ "$manifest_loaded" -eq 1 ] && return 1
  kit_require_manifest "$cwd"
  manifest_loaded=1
}

# kit_fail_closed_on_exit: every guard calls it right after sourcing this file. Claude Code blocks only on exit 2, so
# a guard that dies on its own (a builtin an old bash lacks, an unbound variable under set -u) would let the command
# run; this turns every exit other than 0 (allow) and 2 (block) into a block. doctor.sh never calls it: it exits 0.
kit_fail_closed_on_exit() {
  trap 'kit__rc=$?; [ "$kit__rc" -eq 0 ] || [ "$kit__rc" -eq 2 ] || block "the guard itself failed (exit $kit__rc), so the command is refused (fail closed)" "$KIT_GUARD_RULE"' EXIT
}

# ---------------------------------------------------------------- paths

# kit_norm_path PATH: lexically normalise an absolute-ish path (collapses ., .., //).
kit_norm_path() {
  local IFS=/ part
  local -a out=()
  set -f
  for part in $1; do
    case "$part" in
      "" | .) ;;
      ..) [ "${#out[@]}" -eq 0 ] || unset "out[$((${#out[@]} - 1))]" ;;
      *) out+=("$part") ;;
    esac
  done
  set +f
  if [ "${#out[@]}" -eq 0 ]; then printf '/'; else printf '/%s' "${out[@]}"; fi
}

# kit_rel_to_root PATH: print "." for the consumer root, "sub/dir" for a path under it, nothing otherwise.
kit_rel_to_root() {
  local p phys cand
  [ -n "$1" ] || return 0
  p="$(kit_norm_path "$1")"
  if [ -d "$1" ]; then phys="$(cd "$1" 2>/dev/null && pwd -P)"; else phys="$p"; fi
  for cand in "$p" "$phys"; do
    if [ "$cand" = "$root" ]; then printf '.'; return 0; fi
    case "$cand" in "$root"/*) printf '%s' "${cand#"$root"/}"; return 0 ;; esac
  done
}

kit_is_root() { [ "$(kit_rel_to_root "$1")" = "." ]; }

# kit_resolve_dir BASE TARGET: the directory a `cd TARGET` lands in from BASE, or "" when TARGET is not a literal path.
kit_resolve_dir() {
  local base="$1" target="$2"
  case "$target" in
    "" | "~") printf '%s' "${HOME:-}" ;;
    "~/"*) printf '%s' "${HOME:-}/${target#\~/}" ;;
    -* | *'$'* | *'*'* | *'?'* | *'['*) printf '' ;;
    /*) kit_norm_path "$target" ;;
    *) [ -n "$base" ] && kit_norm_path "$base/$target" ;;
  esac
}

# ---------------------------------------------------------------- command splitting

KIT_AWK_RULE="Install awk (the system awk, mawk, gawk or busybox: any POSIX awk)."
KIT_NEST_RULE="Run the inner command directly, not through more than 4 levels of bash -c, eval or npx -c."

# KIT_LEX_AWK: the command lexer, an awk program kit__walk runs with LC_ALL=C (its records are listed at its top).
KIT_LEX_AWK='
# The command lexer kit__walk runs (LC_ALL=C): a shell command on stdin, one record per line on stdout.
#   c<F><w1>US<w2>...  a simple command, quotes removed (a quoted newline is GS); F is ; or | (in a pipeline) or &
#                      (in the background). A substitution is the word $(_), a read-only one RS<name>RS (toplevel,
#                      branch, abbrev, pwd), resolved by the walker.
#   ( )    a subshell, substitution or script fed to a shell opens / closes.     u   the directory is unknown now.
#   s<x>   a here-string a shell runs: lexed again.     w   back to the start (unterminated input only).
#   r n<words>... e    a raw block: the 0.17.6 split of the text (see naive), walked with the directory kept.
#   .      the last record. Exit 0, or 3 when the input ends inside a quote, a substitution or a case.
# Raw blocks: every command but a data one (isdata) whose text holds a separator, a line break or a quoted blank
# gets one, so nothing is checked less than in 0.17.6; a data command keeps its prose out of it unless the input
# turns data off (nodata: eval, source, a function, a piped compound...). POSIX awk only; no apostrophe in this text.
BEGIN {
	US = "\037"; RS0 = "\036"; GS = "\035"; BQ = "`"; SQ = "\047"; DQ = "\""; CTL = "[" RS0 US "]"; QCH = "[" DQ SQ "]"
	SHW = "(^|[ \t;|&(])(bash|sh|zsh|dash|ksh|fish|eval|source|ssh)([ \t]|$)"
	PURE["git" US "rev-parse" US "--show-toplevel"] = "toplevel"; PURE["git" US "branch" US "--show-current"] = "branch"
	PURE["git" US "rev-parse" US "--abbrev-ref" US "HEAD"] = "abbrev"; PURE["pwd"] = "pwd"
	hfirst = 1; pushcmd("o")
}
# a GS is a line break (the walker passes a quoted newline that way); the other two separators become blanks
{ gsub(CTL, " "); m = split($0, a, GS); if (!m) L[++nl] = ""; for (k = 1; k <= m; k++) L[++nl] = a[k] }
END {
	for (ln = 1; ln <= nl; ln++) { line = L[ln]; n = split(line, ch, ""); if (hbody) body(); else scan() }
	finish()
	for (k = 1; k <= no; k++)
		if (substr(OUT[k], 1, 1) != "?") print OUT[k]
		else if (nodata) { split(substr(OUT[k], 2), a, " "); rawblk(a[1] + 0, a[2] + 0, a[3] + 0, a[4] + 0, 1) }
	print "."; exit rc
}
function out(s) { OUT[++no] = s }
function emit(s, now) { if (now) print s; else out(s) }

# K[sp]: o top, p subshell, q process substitution, x $( ), b backticks, m arithmetic (command contexts, each with
# its frame F[sp], the simple command being built), and s d a ($ and quote) e (${ } $[ ]) y (array literal)
# h (unquoted heredoc body), which share the frame below them.
function pushcmd(t,   f) {
	f = ++nfr; sp++; K[sp] = t; F[sp] = f; IB[sp] = t == "b" || IB[sp - 1]; PD[sp] = SUB[sp] = CNT[sp] = RAWN[sp] = 0
	CS[f] = ""; PP[f] = 0; reset(f)
}
function pushq(t, closer) { sp++; K[sp] = t; F[sp] = F[sp - 1]; IB[sp] = IB[sp - 1]; ED[sp] = AB[sp] = 0; EC[sp] = closer; AS[sp] = i }
function reset(f) { NW[f] = INW[f] = WB[f] = SL[f] = UNS[f] = RTG[f] = HX[f] = ND[f] = RD[f] = U[f] = NHO[f] = PC[f] = DB[f] = HSF[f] = 0; CW[f] = "" }
function cmdctx(t) { return t == "p" || t == "q" || t == "x" || t == "b" || t == "m" }
# CS[f]: the case statements open in frame f, innermost last, one digit each: 1 before in, 2 a pattern, 3 a body
function cst(f) { return substr(CS[f], length(CS[f])) + 0 }
function csset(f, v) { CS[f] = substr(CS[f], 1, length(CS[f]) - 1) v }

# words: slices of the line (WB = where the pending slice starts), joined when a quote or escape ends one
function start(f) { if (!SL[f]) { SL[f] = ln; SC[f] = i } }
function wch(f) { start(f); INW[f] = 1; PC[f] = 0; if (!WB[f]) WB[f] = i }
function flush(f, to) { if (WB[f]) { CW[f] = CW[f] substr(line, WB[f], to - WB[f]); WB[f] = 0 } }
function addw(f, s) { CW[f] = CW[f] s; INW[f] = 1 }
function endw(f,   s) {
	flush(f, i)
	if (!INW[f]) return
	s = CW[f]; CW[f] = ""; INW[f] = 0
	if (RTG[f]) { if (RTG[f] == 2) { HSF[f] = 1; HSW[f] = s }; RTG[f] = 0; return }
	if (cst(f) == 1 && s == "in") { csset(f, 2); NW[f] = SL[f] = 0; return }
	if (cst(f) >= 2 && !NW[f] && s == "esac") { csset(f, ""); SL[f] = 0; return }
	# a reserved word that opens a command is not part of it (the walker skips them too, for raw pieces)
	if (!NW[f] && cst(f) != 2 && s ~ /^(!|[{]|then|else|elif|do|if|while|until)$/) { SL[f] = 0; return }
	if (!NW[f] && cst(f) != 2 && s == "case") CS[f] = CS[f] "1"
	if (!NW[f] && s == "[[") DB[f] = 1
	if (s == "]]") DB[f] = 0
	W[f, ++NW[f]] = s
}

# endcmd(f, term): the simple command in frame f ends (term: ; | & or a closing paren)
function endcmd(f, term,   j, s, cls, wsp, p) {
	endw(f)
	cls = term == "|" || term == "&" ? term : ";"
	if (cls == ";" && PP[f]) cls = "|"
	PP[f] = term == "|"; wsp = HSF[f] && HSW[f] ~ /[ \t]/; p = NW[f] ? W[f, 1] : ""; sub(/.*\//, "", p)
	if (NW[f]) {
		s = W[f, 1]; for (j = 2; j <= NW[f]; j++) s = s US W[f, j]
		out("c" cls s); CNT[sp]++; LJ[sp] = s
		if (p == "." || p == "function" || p == "exec" && RD[f]) nodata = 1
		for (j = 1; j <= NW[f]; j++) {
			if (W[f, j] ~ /^(alias|eval|source|coproc|shopt|setopt)$/ || W[f, j] == "set" && j < NW[f] && W[f, j + 1] ~ /^[-+]o/) nodata = 1
			if (W[f, j] ~ /[ \t]/ || index(W[f, j], GS)) wsp = 1
		}
	}
	for (j = 1; j <= NHO[f]; j++) { s = HOW[f, j]; HM[s] = route(f, term, HL[s]); HC[s] = p != "." && p != "source" }
	if (HSF[f] && route(f, term, SL[f]) == "L") { if (p == "." || p == "source") out("s" HSW[f]); else { out("("); out("s" HSW[f]); out(")") } }
	if (SL[f] && (SL[f] != ln || wsp || hassep(substr(L[ln], SC[f], i - SC[f]))))
		if (isdata(f) && term != "|" && !UNS[f] && !HX[f] && !ND[f]) out("?" SL[f] " " SC[f] " " ln " " i)
		else { rawblk(SL[f], SC[f], ln, i, 0); RAWN[sp]++ }
	if (UNS[f] || U[f]) out("u")
	reset(f)
}
# hassep(s): a ; & | ( or ) in raw text s that is not escaped or part of a redirection (2>&1, &>, >|)
function hassep(s) { gsub(/\\./, "", s); gsub(/[0-9]*[<>]&[0-9-]*|&>>?|>[|]/, "", s); return s ~ /[;&|()]/ }
# isdata(f): echo, printf (not -v), git commit / tag / notes or gh pr / issue / release / api, with nothing before it
function isdata(f,   p, k) {
	p = W[f, 1]
	if (p == "printf") { for (k = 2; k <= NW[f]; k++) if (W[f, k] ~ /^-v/) return 0 }
	return p == "echo" || p == "printf" || NW[f] > 1 && (p == "git" && W[f, 2] ~ /^(commit|tag|notes)$/ || p == "gh" && W[f, 2] ~ /^(pr|issue|release|api)$/)
}
# route(f, term, l): what command f does with the heredoc or here-string it opened on line l: L runs it (a shell, eval,
# source, exec, a bare redirection, or a pipe on a line that names a shell), D prints it (cat, tee, a data command),
# R anything else and any body whose line names a shell, both walked raw as 0.17.6 walked them
function route(f, term, l,   p) {
	p = NW[f] ? W[f, 1] : ""; sub(/.*\//, "", p)
	if (!NW[f] || p ~ /^(bash|sh|zsh|dash|ksh|fish|eval|source|exec|\.)$/ || term == "|" && L[l] ~ SHW) return "L"
	return L[l] !~ SHW && (p == "cat" || p == "tee" || isdata(f)) ? "D" : "R"
}

# naive(s, now): the 0.17.6 split. Every ( ) ; & | cuts s whatever the quoting; $( and ( are the record (, ) is ),
# and each other piece is a record n<words>: split on blanks, quote characters removed from every word.
function naive(s, now,   m, k, j, pc, wd, nw, r) {
	gsub(/\$\(/, "(", s); gsub(/[(]/, "\n(\n", s); gsub(/[)]/, "\n)\n", s); gsub(/[;&|]/, "\n", s)
	m = split(s, pc, "\n")
	for (k = 1; k <= m; k++) {
		if (pc[k] == "(" || pc[k] == ")") { emit(pc[k], now); continue }
		if (!(nw = split(pc[k], wd))) continue
		for (j = 1; j <= nw; j++) { gsub(QCH, "", wd[j]); r = j == 1 ? "n" wd[j] : r US wd[j] }
		emit(r, now)
	}
}
# rawblk(sl, sc, el, ec, now): a raw block over line sl column sc to line el column ec (exclusive); a line ending in
# a backslash joins the next with a blank
function rawblk(sl, sc, el, ec, now,   k, s, carry) {
	emit("r", now)
	for (k = sl; k <= el; k++) {
		s = L[k]; if (k == el) s = substr(s, 1, ec - 1); if (k == sl) s = substr(s, sc)
		s = carry s; carry = ""
		if (k < el && s ~ /\\$/) carry = substr(s, 1, length(s) - 1) " "; else naive(s, now)
	}
	if (carry != "") naive(carry, now)
	emit("e", now)
}
function rawlines(a, b) { if (b >= a) rawblk(a, 1, b, length(L[b]) + 1, 0) }

function opensub(t,   f) { f = F[sp]; flush(f, i); start(f); INW[f] = 1; PC[f] = 0; out("("); pushcmd(t); SUB[sp] = 1 }
function closesub(   ph, s) {
	endcmd(F[sp], ")")
	ph = K[sp] != "m" && K[sp] != "q" && CNT[sp] == 1 && !RAWN[sp] && (LJ[sp] in PURE) ? (RS0 PURE[LJ[sp]] RS0) : "$(_)"
	out(")"); s = SUB[sp]; sp--
	if (s) addw(F[sp], ph); else PC[F[sp]] = 1
}
# unwind(to): close every context above to (unterminated); 1 when there was one
function unwind(to,   was) {
	for (; sp > to; sp--) { was = 1; if (cmdctx(K[sp])) { endcmd(F[sp], ";"); out(")") } else UNS[F[sp]] = 1 }
	return was
}

function scan(   c, t, f, nc, k) {
	for (i = 1; i <= n; i++) {
		c = ch[i]; t = K[sp]; f = F[sp]
		# inside backticks a backslash escapes $ ` and itself before anything else reads the text
		if (IB[sp] && c == "\\") { nc = ch[i + 1]; if (nc == BQ || nc == "\\") { UNS[f] = 1; i++; continue }; if (nc == "$") c = ch[++i] }
		if (IB[sp] && c == BQ && t != "h") { for (; K[sp] != "b"; sp--) if (cmdctx(K[sp])) { endcmd(F[sp], ";"); out(")") } else UNS[F[sp]] = 1; closesub(); continue }
		if (t == "s") { if (c == SQ) { flush(f, i); sp-- } else wch(f); continue }
		if (t == "a") {
			# $ and quote: without a backslash the text is the word, with one it stays verbatim
			if (c == "\\") { AB[sp] = 1; i++ } else if (c == SQ) { addw(f, AB[sp] ? substr(line, AS[sp], i - AS[sp] + 1) : substr(line, AS[sp] + 2, i - AS[sp] - 2)); sp-- }
			continue
		}
		if (t == "e") {
			if (c == "\\") i++
			else if (c == EC[sp] && !ED[sp]) sp--
			else if (c == "{" || c == "}") ED[sp] += c == "{" ? 1 : -1
			else if (c == SQ || c == DQ) { UNS[f] = 1; flush(f, i); pushq(c == SQ ? "s" : "d") }
			else if (c == "$" && ch[i + 1] == "(" || c == BQ) { UNS[f] = 1; opensub(c == BQ ? "b" : "x"); if (c == "$") i++ }
			continue
		}
		if (t == "d" || t == "h") {
			if (c == DQ && t == "d") { flush(f, i); sp--; continue }
			if (c == "\\") {
				if (i == n) { flush(f, i); cont = 1; continue }
				nc = ch[i + 1]
				if (nc == "$" || nc == BQ || nc == "\\" || nc == DQ && t == "d") { flush(f, i); WB[f] = ++i; INW[f] = 1 } else if (t == "d") wch(f)
				continue
			}
			if (c == "$") dollar(f); else if (c == BQ) { HX[f] = 1; opensub("b") } else if (t == "d") wch(f)
			continue
		}
		# a command context, or an array literal (y)
		if (c == "\\") { flush(f, i); if (i == n) cont = 1; else { start(f); INW[f] = 1; WB[f] = ++i }; continue }
		if (c == SQ || c == DQ) { flush(f, i); start(f); INW[f] = 1; PC[f] = 0; pushq(c == SQ ? "s" : "d"); continue }
		if (c == "$") { dollar(f); continue }
		if (c == BQ) { HX[f] = 1; opensub("b"); continue }
		if (t == "y") { wch(f); if (c == ")") sp--; continue }
		if (c == " " || c == "\t") { endw(f); continue }
		if (t == "m") {
			if (c == "(") PD[sp]++
			if (c != ")" || PD[sp]-- > 0) { wch(f); continue }
			# (( closed by ) ) rather than )) may be a subshell: unsure
			if (ch[i + 1] == ")") i++; else UNS[F[sp - 1]] = 1
			if (SUB[sp]) closesub(); else { endcmd(f, ";"); out(")"); sp--; PC[F[sp]] = 1 }
			continue
		}
		if (c == "#" && !INW[f]) { rawblk(ln, i, ln, n + 1, 0); i = n; continue }
		# inside [[ ]] these are part of the test
		if (DB[f] && c ~ /[()|&<>]/) { flush(f, i); if (!INW[f] || CW[f] != "]]") { wch(f); continue } }
		# an operator ends the command where it starts: endcmd before i moves past it
		if (c == ";") {
			if (cst(f) == 2) { endw(f); continue }
			endcmd(f, ";"); nc = ch[i + 1]
			if (nc == ";" || nc == "&") { i++; if (nc == ";" && ch[i + 1] == "&") i++; if (cst(f) == 3) csset(f, 2) }
			continue
		}
		if (c == "&") {
			nc = ch[i + 1]
			if (nc == ">") { endw(f); start(f); RTG[f] = RD[f] = 1; i++; if (ch[i + 1] == ">") i++ }
			else { endcmd(f, nc == "&" ? ";" : "&"); if (nc == "&" || nc == "|" || nc == "!") i++ }
			continue
		}
		if (c == "|") {
			if (cst(f) == 2) { endw(f); continue }
			endw(f); nc = ch[i + 1]
			# a piped compound command: what it prints (data commands included) may feed an interpreter
			if (nc != "|" && (PC[f] || NW[f] == 1 && W[f, 1] ~ /^(}|done|fi|esac)$/)) nodata = U[f] = 1
			endcmd(f, nc == "|" ? ";" : "|"); if (nc == "|" || nc == "&") i++
			continue
		}
		if (c == "<" || c == ">") { redir(f, c); continue }
		if (c == "(") {
			if (cst(f) == 2 && !NW[f] && !INW[f]) continue
			if (INW[f]) { flush(f, i); if (CW[f] ~ /^[A-Za-z_][A-Za-z0-9_]*\+?=$/) { wch(f); pushq("y"); continue } }
			endw(f)
			if (!NW[f] || NW[f] == 1 && W[f, 1] == "for" && ch[i + 1] == "(") {
				out("("); if (ch[i + 1] == "(") { i++; pushcmd("m") } else pushcmd("p"); continue
			}
			for (k = i + 1; ch[k] == " " || ch[k] == "\t"; k++);
			# [keywords] [function] name (): a definition; the name goes, its body is checked as if it ran
			if (ch[k] == ")") { nodata = 1; NW[f]--; if (NW[f] && W[f, NW[f]] == "function") NW[f]--; if (!NW[f]) SL[f] = 0; i = k; continue }
			start(f); UNS[f] = 1; out("("); pushcmd("p"); continue
		}
		if (c == ")") {
			if (cst(f) == 2) { NW[f] = INW[f] = WB[f] = SL[f] = 0; CW[f] = ""; csset(f, 3) }
			else if (t == "x" || t == "q") closesub()
			else if (t == "p") { endcmd(f, ";"); out(")"); sp--; PC[F[sp]] = 1 }
			else { endcmd(f, ";"); out("u") }
			continue
		}
		wch(f)
	}
	endofline()
}

# dollar(f): $ at i: $( $(( ${ $[ $ and quote, $ and double quote, or a plain $
function dollar(f,   nc) {
	nc = ch[i + 1]
	if (nc == "(") { if (ch[i + 2] == "(") { HX[f] = 1; opensub("m"); i += 2 } else { opensub("x"); i++ } }
	else if (nc == "{" || nc == "[") { HX[f] = 1; wch(f); pushq("e", nc == "{" ? "}" : "]"); i++ }
	else if ((nc == SQ || nc == DQ) && K[sp] != "d" && K[sp] != "h") { HX[f] += nc == SQ; flush(f, i); start(f); INW[f] = 1; PC[f] = 0; pushq(nc == SQ ? "a" : "d"); i++ }
	else if (K[sp] != "h") wch(f)
}
# redir(f, c): < or > at i: a process substitution, a here-string, a heredoc, or a redirection (its target dropped)
function redir(f, c,   nc, k, v) {
	nc = ch[i + 1]
	if (nc == "(") { flush(f, i); start(f); INW[f] = nodata = 1; out("("); pushcmd("q"); SUB[sp] = 1; i++; return }
	flush(f, i)
	if (INW[f] && CW[f] ~ /^[0-9]+$/) { CW[f] = ""; INW[f] = 0 } else endw(f)
	start(f); RD[f] = RTG[f] = 1
	if (c == "<" && nc == "<") { if (ch[i + 2] == "<") { RTG[f] = 2; i += 2 } else { RTG[f] = 0; heredoc(f) }; return }
	if (nc == ">" || nc == "|" || c == "<" && nc == ">") { i++; return }
	if (nc != "&") return
	for (k = i += 2; ch[k] ~ /[0-9]/; k++) v = v ch[k]
	if (v != "" || ch[k] == "-") { RTG[f] = 0; if (v + 0 >= 3) ND[f] = 1; i = ch[k] == "-" ? k : k - 1 } else { if (ch[k] == "$") ND[f] = 1; i-- }
}

# heredoc(f): << at i opens a heredoc; its body starts on the next line, its owner decides what it is (endcmd)
function heredoc(f,   j, d, q, c, k) {
	j = i + 2; if (ch[j] == "-") j++
	for (k = j; ch[j] == " " || ch[j] == "\t"; j++);
	for (; j <= n && ch[j] !~ /[ \t;&|()<>]/; j++) {
		c = ch[j]
		if (c == SQ || c == DQ) { q = 1; for (j++; j <= n && ch[j] != c; j++) { if (c == DQ && ch[j] == "\\") j++; d = d ch[j] } }
		else if (c == "\\") { q = 1; d = d ch[++j] }
		else { if (c == "$" && (ch[j + 1] == SQ || ch[j + 1] == DQ)) UNS[f] = q = 1; d = d c }
	}
	if (d == "" || hbody || K[sp] == "m" || IB[sp]) UNS[f] = 1
	else { HD[++hn] = d; HT[hn] = ch[k - 1] == "-"; HQ[hn] = q; HL[hn] = ln; HM[hn] = ""; HC[hn] = 1; HOW[f, ++NHO[f]] = hn }
	i = j - 1
}
function endofline(   t, f) {
	if (cont) { cont = 0; return }
	t = K[sp]; f = F[sp]
	if (t == "s" || t == "d" || t == "e" || t == "y") { flush(f, n + 1); addw(f, t == "y" ? " " : GS); return }
	if (t == "a") { addw(f, substr(line, AS[sp]) GS); AS[sp] = AB[sp] = 1; return }
	if (t == "h") return
	i = n + 1
	if (t == "m") { endw(f); return }
	endcmd(f, ";")
	if (hn >= hfirst && !hbody) { hbody = 1; hcur = hfirst; startone() }
}
# a heredoc body: L lexed in its own scope (unless sourced), D dropped (an unquoted one has its expansions
# scanned), R walked raw; L and D are walked raw too when they end inside a quote or substitution
function startone(   k) {
	k = hcur; if (HM[k] == "") HM[k] = "L"
	bcont = 0; HB[k] = ln + 1; S0[k] = sp
	if (HM[k] == "L") { if (HC[k]) out("("); pushcmd("o") } else if (HM[k] == "D" && !HQ[k]) pushcmd("h")
}
function body(   k, t) {
	k = hcur; t = line; if (HT[k]) sub(/^\t+/, "", t)
	if (!bcont && t == HD[k]) { endone(); return }
	if (HM[k] == "L" || HM[k] == "D" && !HQ[k]) scan()
	bcont = !HQ[k] && line ~ /(^|[^\\])(\\\\)*\\$/
}
function endone(   k, bad) {
	k = hcur
	if (HM[k] == "L") { bad = unwind(S0[k] + 1); i = n + 1; endcmd(F[sp], ";"); sp--; if (HC[k]) out(")") }
	else if (HM[k] == "D" && !HQ[k]) { bad = unwind(S0[k] + 1); sp-- }
	if (HM[k] == "R" || bad) rawlines(HB[k], ln - 1)
	if (++hcur > hn) { hbody = 0; hfirst = hn + 1 } else startone()
}
function finish() {
	ln = nl; line = L[nl]; n = split(line, ch, ""); i = n + 1
	for (ln = nl + 1; hbody;) endone()
	ln = nl
	if (sp == 1 && CS[F[1]] == "") { endcmd(F[1], ";"); return }
	rc = 3; unwind(1); endcmd(F[1], ";"); out("w"); rawlines(1, nl)
}
'

# kit__wrap_value WRAPPER OPTION: does OPTION of the wrapper command take the next word as its value?
kit__wrap_value() {
  case "$1 $2" in
    "sudo -u" | "sudo -g" | "sudo -C" | "sudo -D" | "sudo -h" | "sudo -p" | "sudo -r" | "sudo -t" | "sudo -U" | "sudo -T" \
      | "sudo --user" | "sudo --group" | "sudo --chdir" | "doas -u" | "doas -C" | "env -u" | "env --unset" | "env -C" \
      | "env --chdir" | "nice -n" | "nice --adjustment" | "timeout -s" | "timeout -k" | "timeout --signal" \
      | "timeout --kill-after" | "xargs -I" | "xargs -n" | "xargs -P" | "xargs -L" | "xargs -s" | "xargs -d" | "xargs -E" \
      | "xargs -a" | "exec -a" | "stdbuf -i" | "stdbuf -o" | "stdbuf -e" | "ionice -c" | "ionice -n" | "ionice -p") return 0 ;;
  esac
  return 1
}

# kit_pm_parse PM ARGS...: for an npm/pnpm/yarn/bun command, skip its global options (and their values) and set
# kit_pm_sub (the subcommand), kit_pm_rest (the words after it) and kit_inner (the command it runs, when it runs one:
# exec/x/dlx X, run|run-script shopify|prisma, or pnpm/yarn/bun shopify|prisma; empty otherwise).
kit_pm_parse() {
  local pm="${1##*/}" i=1 j=0
  local -a w=("$@")
  kit_pm_sub=""; kit_pm_rest=(); kit_inner=()
  while [ "$i" -lt "${#w[@]}" ]; do
    case "${w[i]}" in
      -*=*) i=$((i + 1)) ;;
      --prefix | --workspace | --registry | --cache | --userconfig | --globalconfig | --loglevel | --dir | --filter \
        | --workspace-concurrency | --reporter | --cwd | -C | -F) i=$((i + 2)) ;;
      -w) if [ "$pm" = npm ]; then i=$((i + 2)); else i=$((i + 1)); fi ;;
      -*) i=$((i + 1)) ;;
      *) break ;;
    esac
  done
  [ "$i" -lt "${#w[@]}" ] || return 0
  kit_pm_sub="${w[i]}"
  [ $((i + 1)) -ge "${#w[@]}" ] || kit_pm_rest=("${w[@]:i+1}")
  case "$kit_pm_sub" in
    exec | x | dlx)
      while [ "$j" -lt "${#kit_pm_rest[@]}" ]; do
        case "${kit_pm_rest[j]}" in
          -p | --package | -c | --call) j=$((j + 2)) ;;
          -*) j=$((j + 1)) ;;
          *) break ;;
        esac
      done
      [ "$j" -ge "${#kit_pm_rest[@]}" ] || kit_inner=("${kit_pm_rest[@]:j}") ;;
    run | run-script)
      case "${kit_pm_rest[0]:-}" in
        shopify | prisma)
          kit_inner=("${kit_pm_rest[0]}")
          for j in "${!kit_pm_rest[@]}"; do [ "$j" -eq 0 ] || [ "${kit_pm_rest[j]}" = -- ] || kit_inner+=("${kit_pm_rest[j]}"); done ;;
      esac ;;
    shopify | prisma) [ "$pm" = npm ] || kit_inner=("$kit_pm_sub" ${kit_pm_rest[@]+"${kit_pm_rest[@]}"}) ;;
  esac
  return 0
}

kit__stack_pop() {
  if [ "${#kit_stack[@]}" -gt 0 ]; then
    dir="${kit_stack[$((${#kit_stack[@]} - 1))]}"
    unset "kit_stack[$((${#kit_stack[@]} - 1))]"
    return 0
  fi
  return 1
}

# kit__stack_trim N: drop the subshell stack back to its first N entries.
kit__stack_trim() { while [ "${#kit_stack[@]}" -gt "$1" ]; do unset "kit_stack[$((${#kit_stack[@]} - 1))]"; done; }

# kit__resolve: in the record being dispatched (kw_w), replace each read-only substitution the lexer marked
# (\036name\036) by its value in the effective directory, or by $(_) when that cannot be read. Word splitting on \036
# keeps it linear on a long word (a ${x//...} would not be on bash 3.2).
kit__resolve() {
  local k j v out
  local -a part
  for k in "${!kw_w[@]}"; do
    [[ "${kw_w[k]}" == *$'\036'* ]] || continue
    IFS=$'\036'; set -f; part=(${kw_w[k]}); set +f; IFS="$kw_ifs"
    out=""
    for j in "${!part[@]}"; do
      if [ $((j % 2)) -eq 0 ]; then out+="${part[j]}"; continue; fi
      v=""
      case "${part[j]}" in
        toplevel) v="$(git -C "${dir:-/nonexistent}" rev-parse --show-toplevel 2>/dev/null)" ;;
        branch) v="$(git -C "${dir:-/nonexistent}" branch --show-current 2>/dev/null)" ;;
        abbrev) v="$(git -C "${dir:-/nonexistent}" rev-parse --abbrev-ref HEAD 2>/dev/null)" ;;
        pwd) v="$dir" ;;
      esac
      out+="${v:-\$(_)}"
    done
    kw_w[k]="$out"
  done
}

# kit__walk TEXT CALLBACK DEPTH [CHILD]: lex TEXT and act on its records (see KIT_LEX_AWK): keep the subshell stack
# and the effective directory, dispatch every command, and put the directory back after each raw block and, with
# CHILD 1 (a script a shell runs), after TEXT. The records come on fd 9, so a callback reading stdin cannot eat them.
kit__walk() {
  local kw_cb="$2" kw_depth="$3" kw_dir0="$dir" kw_n0="${#kit_stack[@]}" kw_out kw_rc kw_rec kw_seen=0 kw_rdir="" kw_ifs="$IFS"
  local -a kw_w kw_rstack=()
  [ "$kw_depth" -le 4 ] || block "the command nests bash -c, eval or npx -c more than 4 deep, so it cannot be checked (fail closed)" "$KIT_NEST_RULE"
  command -v awk >/dev/null 2>&1 || block "awk is not installed, so the command cannot be split (fail closed)" "$KIT_AWK_RULE"
  kw_out="$(printf '%s\n' "$1" | LC_ALL=C awk "$KIT_LEX_AWK" 2>/dev/null)"
  kw_rc=$?
  case "$kw_rc" in 0 | 3) ;; *) block "the command lexer failed (awk exit $kw_rc), so the command cannot be split (fail closed)" "$KIT_GUARD_RULE" ;; esac
  while IFS= read -r -u 9 kw_rec; do
    case "$kw_rec" in
      [cn]*)
        [ "${kw_rec:0:1}" = n ] || kw_rec="${kw_rec:1}"
        IFS=$'\037'; set -f; kw_w=(${kw_rec:1}); set +f; IFS="$kw_ifs"
        [ "${#kw_w[@]}" -gt 0 ] || continue
        [[ "$kw_rec" != *$'\036'* ]] || kit__resolve
        kit__dispatch "$kw_cb" "${kw_rec:0:1}" "$kw_depth" ;;
      .) kw_seen=1 ;;
      "(") kit_stack+=("$dir") ;;
      ")") kit__stack_pop || true ;;
      u) dir="" ;;
      w) dir="$kw_dir0"; kit__stack_trim "$kw_n0" ;;
      r) kw_rdir="$dir"; kw_rstack=(${kit_stack[@]+"${kit_stack[@]}"}) ;;
      e) dir="$kw_rdir"; kit_stack=(${kw_rstack[@]+"${kw_rstack[@]}"}) ;;
      s*) kit__walk "${kw_rec#s}" "$kw_cb" $((kw_depth + 1)) ;;
    esac
  done 9<<<"$kw_out"
  [ "$kw_seen" -eq 1 ] || block "the command lexer's output was cut short, so the command cannot be split (fail closed)" "$KIT_GUARD_RULE"
  if [ "${4:-0}" -eq 1 ]; then dir="$kw_dir0"; kit__stack_trim "$kw_n0"; fi
  return 0
}

# kit__base WORD: kb = WORD after its last / (${WORD##*/} is quadratic in bash on a long word; this is not)
kit__base() { kb="$1"; case "$kb" in */*) kb="${kb%/*}"; kb="${1:${#kb}+1}" ;; esac; }

# kit__dispatch CALLBACK FLAG DEPTH: one simple command, the words in kw_w (FLAG | in a pipeline, & in the background,
# ; else, n for a piece of a raw block, split as 0.17.6 did). Skips assignments, keywords and wrappers, walks the
# script of bash -c, eval and npx -c again, follows cd / pushd / popd, and calls CALLBACK "<dir>" <prog> <args...>.
kit__dispatch() {
  local kd_cb="$1" kd_flag="$2" kd_depth="$3" kd_i=0 kd_j kd_c kd_wrap kd_moves=1 kb
  kit__base "${kw_w[0]}"
  case "${kw_w[0]}" in *=*) ;; *) case "$kb" in
    '!' | '{' | '}' | always | then | do | else | elif | if | while | until | builtin | noglob | nocorrect | - | repeat | function | coproc \
      | eval | command | time | env | exec | nohup | sudo | doas | nice | timeout | xargs | stdbuf | ionice | setsid \
      | bash | sh | zsh | dash | ksh | npx | pnpx | bunx | corepack | cd | pushd | popd) ;;
    *) "$kd_cb" "$dir" "${kw_w[@]}"; return 0 ;;
  esac ;; esac
  while [ "$kd_i" -lt "${#kw_w[@]}" ]; do
    kit__base "${kw_w[kd_i]}"; kd_wrap="$kb"
    case "${kw_w[kd_i]}" in
      [A-Za-z_]*=*) kd_c="${kw_w[kd_i]%%=*}"; kd_c="${kd_c%+}"; case "${kd_c%%\[*}" in *[!A-Za-z0-9_]*) ;; *) kd_wrap="VAR=" ;; esac ;;
    esac
    case "$kd_wrap" in
      VAR= | '!' | '{' | '}' | always | then | do | else | elif | if | while | until | builtin) kd_i=$((kd_i + 1)) ;;
      noglob | nocorrect | -) kd_moves=2; kd_i=$((kd_i + 1)) ;;
      repeat | function) kd_i=$((kd_i + 2)) ;;
      coproc) kd_moves=0; kd_i=$((kd_i + 1)); [ "${kw_w[kd_i + 1]:-}" != "{" ] || kd_i=$((kd_i + 1)) ;;
      eval)
        if [ "$kd_flag" != n ]; then [ $((kd_i + 1)) -ge "${#kw_w[@]}" ] || kit__walk "${kw_w[*]:kd_i+1}" "$kd_cb" $((kd_depth + 1)); return 0; fi
        kd_i=$((kd_i + 1)); [ "${kw_w[kd_i]:-}" != -- ] || kd_i=$((kd_i + 1)) ;;
      command | time | env | exec | nohup | sudo | doas | nice | timeout | xargs | stdbuf | ionice | setsid)
        case "$kd_wrap" in time) ;; command) kd_moves=2 ;; *) kd_moves=0 ;; esac
        kd_i=$((kd_i + 1))
        while [ "$kd_i" -lt "${#kw_w[@]}" ]; do
          case "${kw_w[kd_i]}" in
            --) kd_i=$((kd_i + 1)); break ;;
            -*) if kit__wrap_value "$kd_wrap" "${kw_w[kd_i]}"; then kd_i=$((kd_i + 2)); else kd_i=$((kd_i + 1)); fi ;;
            *=*) if [ "$kd_wrap" = env ]; then kd_i=$((kd_i + 1)); else break; fi ;;
            *) break ;;
          esac
        done
        if [ "$kd_wrap" = timeout ] && [ "$kd_i" -lt "${#kw_w[@]}" ]; then kd_i=$((kd_i + 1)); fi ;;
      bash | sh | zsh | dash | ksh)
        kd_j=$((kd_i + 1)); kd_c=0
        while [ "$kd_j" -lt "${#kw_w[@]}" ]; do
          case "${kw_w[kd_j]}" in
            --) kd_j=$((kd_j + 1)); break ;;
            --rcfile | --init-file) kd_j=$((kd_j + 2)) ;;
            --*) kd_j=$((kd_j + 1)) ;;
            [-+]*[oO]*) [[ "${kw_w[kd_j]}" != -*c* ]] || kd_c=1; kd_j=$((kd_j + 2)) ;;
            -*c*) kd_c=1; kd_j=$((kd_j + 1)) ;;
            [-+]?*) kd_j=$((kd_j + 1)) ;;
            *) break ;;
          esac
        done
        [ "$kd_c" -eq 1 ] || break
        if [ "$kd_flag" != n ]; then [ "$kd_j" -ge "${#kw_w[@]}" ] || kit__walk "${kw_w[kd_j]}" "$kd_cb" $((kd_depth + 1)) 1; return 0; fi
        kd_i=$kd_j ;;
      npx | pnpx | bunx | corepack)
        kd_moves=0; kd_i=$((kd_i + 1))
        while [ "$kd_i" -lt "${#kw_w[@]}" ]; do
          case "${kw_w[kd_i]}" in
            -c | --call | --call=*)
              kd_c="${kw_w[kd_i]#--call=}"
              case "$kd_c" in -c | --call) kd_i=$((kd_i + 1)); kd_c="${kw_w[kd_i]:-}" ;; esac
              if [ "$kd_flag" != n ]; then kit__walk "$kd_c" "$kd_cb" $((kd_depth + 1)) 1; return 0; fi
              kw_w[kd_i]="$kd_c"; break ;;
            -p | --package) kd_i=$((kd_i + 2)) ;;
            -*) kd_i=$((kd_i + 1)) ;;
            *) break ;;
          esac
        done ;;
      *) break ;;
    esac
  done
  [ "$kd_i" -lt "${#kw_w[@]}" ] || return 0
  kit__base "${kw_w[kd_i]}"
  case "$kb" in
    cd | pushd | popd)
      # In a pipeline a cd may run in a subshell (bash) or not (zsh, last element), and behind command (bash: the
      # builtin, zsh: a program) or a zsh-only modifier it may run or not: the directory becomes unknown. In the
      # background or behind a program that execs (env, sudo, npx...) it leaves the directory where it was.
      if [ "$kd_flag" = "|" ] || [ "$kd_moves" -eq 2 ]; then dir=""; return 0; fi
      if [ "$kd_flag" = "&" ] || [ "$kd_moves" -eq 0 ]; then return 0; fi
      if [ "$kb" = popd ]; then kit__stack_pop || dir=""; else dir="$(kit_resolve_dir "$dir" "${kw_w[kd_i + 1]:-}")"; fi
      return 0 ;;
  esac
  "$kd_cb" "$dir" "${kw_w[@]:kd_i}"
}

# kit_walk_commands CMD CALLBACK: for every simple command in CMD, call CALLBACK "<effective dir>" <prog> <args...>,
# where words start at the program (assignments, keywords and wrappers like env/sudo/timeout/xargs/command/time are
# skipped; the script of bash -c, eval and npx -c is walked as commands). The effective dir starts at $cwd, follows
# literal cd/pushd/popd and the subshells, and is "" once it cannot be known. The command is lexed as the shell reads
# it (KIT_LEX_AWK), and the 0.17.6 split of every command but a data one (echo, printf, git commit, gh pr...) is
# walked as well, so the prose of a data command is the only text no longer checked as commands.
kit_walk_commands() {
  kit_stack=()
  dir="$cwd"
  kit__walk "$1" "$2" 0
}
