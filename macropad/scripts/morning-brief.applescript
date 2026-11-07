-- Brife: aabn Terminal og koer morgen briefing-skillen i Claude
-- (kalender, mail, paamindelser, vejr, indeklima og forecast).
-- Koeres af MacroPad'en via follow-tjenesten ("script:morning-brief").

tell application "Terminal"
	activate
	do script "claude " & quoted form of "Kør morgen briefing"
end tell
