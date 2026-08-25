-- Pixelmator Pro-makro: saet billedets resolution til 300 og eksporter
-- som PNG til mappen "Grafik upload" paa Skrivebordet (oprettes automatisk).
-- Koeres af MacroPad'en via follow-tjenesten ("script:pixelmator-300px").

set outFolder to (POSIX path of (path to desktop folder)) & "Grafik upload/"
do shell script "mkdir -p " & quoted form of outFolder

-- Fast sti: Thomas' version 3.8 — IKKE den nye "Creator Studio" (4.3),
-- som ogsaa kalder sig "Pixelmator Pro"
tell application "/Applications/Pixelmator Pro.app"
	if not (exists front document) then return
	set docName to name of front document
	if docName contains "." then
		set AppleScript's text item delimiters to "."
		set docName to text items 1 thru -2 of docName as text
		set AppleScript's text item delimiters to ""
	end if
	tell front document
		resize image resolution 300
		export to POSIX file (outFolder & docName & ".png") as PNG
	end tell
end tell
