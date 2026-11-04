on fjoin(lst, sep)
	set {tid, AppleScript's text item delimiters} to {AppleScript's text item delimiters, sep}
	set t to lst as text
	set AppleScript's text item delimiters to tid
	return t
end fjoin

with timeout of 600 seconds
	tell application "Contacts"
		set navne to name of every person
		set firmaer to organization of every person
		set stillinger to job title of every person
		set tlfs to value of phones of every person
		set ems to value of emails of every person
	end tell
end timeout
set n to count of navne
set linjer to {}
repeat with i from 1 to n
	set navn to item i of navne
	if navn is missing value then set navn to ""
	set firma to item i of firmaer
	if firma is missing value then set firma to ""
	set stil to item i of stillinger
	if stil is missing value then set stil to ""
	set tlf to my fjoin(item i of tlfs, " · ")
	set em to my fjoin(item i of ems, " · ")
	set end of linjer to navn & "<<F>>" & firma & "<<F>>" & stil & "<<F>>" & tlf & "<<F>>" & em
end repeat
return my fjoin(linjer, "<<R>>")
