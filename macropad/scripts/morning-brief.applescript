-- Brife: aabn Terminal og faa Claude til at opdatere dagens morning brief
-- og aabne det i browseren.
-- Koeres af MacroPad'en via follow-tjenesten ("script:morning-brief").

tell application "Terminal"
	activate
	do script "claude " & quoted form of "Kør mit morning brief: opdater det med dagens kalender, vejr og trafik, og åbn den færdige side i browseren"
end tell
