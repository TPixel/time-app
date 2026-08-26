-- Skift tastaturlayout til Dansk via inputmenuen i menulinjen.
-- Kraever: begge layouts tilfoejet i Systemindstillinger -> Tastatur ->
-- Inputkilder, samt Tilgaengeligheds-tilladelse.
-- Koeres af MacroPad'en via follow-tjenesten ("script:keyboard-dk").

tell application "System Events"
	tell process "TextInputMenuAgent"
		click menu bar item 1 of menu bar 2
		delay 0.2
		set m to menu 1 of menu bar item 1 of menu bar 2
		try
			click (first menu item of m whose title contains "Dansk")
		on error
			key code 53 -- Esc: luk menuen igen
		end try
	end tell
end tell
