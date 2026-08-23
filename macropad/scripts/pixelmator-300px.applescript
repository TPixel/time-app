-- Pixelmator Pro-makro: skaler billedet til 300 px bredde og eksporter
-- som PNG til mappen "Grafik upload" paa Skrivebordet (oprettes automatisk).
-- Koeres af MacroPad'en via follow-tjenesten ("script:pixelmator-300px").

set outFolder to (POSIX path of (path to desktop folder)) & "Grafik upload/"
do shell script "mkdir -p " & quoted form of outFolder

tell application "Pixelmator Pro"
	if not (exists front document) then return
	set docName to name of front document
	if docName contains "." then
		set AppleScript's text item delimiters to "."
		set docName to text items 1 thru -2 of docName as text
		set AppleScript's text item delimiters to ""
	end if
	tell front document
		resize image width 300
		export to POSIX file (outFolder & docName & ".png") as PNG
	end tell
end tell
