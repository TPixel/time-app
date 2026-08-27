-- Aabn Terminal og start en Claude-session.
-- Vil man have en FAST PROMPT med, aendres linjen til fx:
--   do script "claude " & quoted form of "giv mig dagens morgenbrief"
-- Koeres af MacroPad'en via follow-tjenesten ("script:claude-start").

tell application "Terminal"
	activate
	do script "claude"
end tell
