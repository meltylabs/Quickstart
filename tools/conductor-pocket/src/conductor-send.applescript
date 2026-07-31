on workspaceMatches(workspaceName, candidateName)
	if candidateName is workspaceName then return true
	if candidateName starts with (workspaceName & " +") then return true
	return false
end workspaceMatches

on draftConflict(existingDraft)
	set encodedDraft to do shell script "/usr/bin/printf %s " & quoted form of existingDraft & " | /usr/bin/base64 | /usr/bin/tr -d '\\n'"
	return "{\"ok\":false,\"code\":\"draft_conflict\",\"draftBase64\":\"" & encodedDraft & "\"}"
end draftConflict

on decodeBase64(encodedValue)
	if encodedValue is "" then return ""
	return do shell script "/usr/bin/printf %s " & quoted form of encodedValue & " | /usr/bin/base64 -D" without altering line endings
end decodeBase64

on normalizedDraft(rawValue)
	set valueText to rawValue as text
	if valueText ends with linefeed then
		if (length of valueText) is 1 then return ""
		return text 1 thru -2 of valueText
	end if
	return valueText
end normalizedDraft

on getWebArea()
	tell application "System Events"
		tell process "Conductor"
			try
				return UI element 1 of scroll area 1 of group 1 of group 1 of front window
			end try
		end tell
	end tell
	return missing value
end getWebArea

on getSidebarGroup()
	set webArea to getWebArea()
	if webArea is missing value then return missing value
	tell application "System Events"
		try
			set rootElements to UI elements of webArea
			if (count of rootElements) is greater than or equal to 2 then return item 2 of rootElements
		end try
	end tell
	return missing value
end getSidebarGroup

on getMainGroup()
	set webArea to getWebArea()
	if webArea is missing value then return missing value
	tell application "System Events"
		try
			set rootElements to UI elements of webArea
			if (count of rootElements) is greater than or equal to 3 then return item 3 of rootElements
		end try
	end tell
	return missing value
end getMainGroup

on getWorkspaceRoute(workspaceName, sidebarGroup)
	if sidebarGroup is missing value then return missing value
	set matchingRoutes to {}
	tell application "System Events"
		try
			set sidebarElements to UI elements of sidebarGroup
		on error
			return missing value
		end try
		set sidebarChildCount to count of sidebarElements
		repeat with containerIndex from 1 to sidebarChildCount
			set workspaceContainer to item containerIndex of sidebarElements
			try
				set workspaceElements to UI elements of workspaceContainer
				set containerChildCount to count of workspaceElements
				repeat with linkIndex from 1 to containerChildCount
					set candidate to item linkIndex of workspaceElements
					if (role of candidate as text) is "AXLink" then
						set candidateName to name of candidate as text
						if my workspaceMatches(workspaceName, candidateName) then
							set containerOffset to containerIndex - 1
							set linkOffset to linkIndex - 1
							copy {candidate, containerOffset, linkOffset, sidebarChildCount, containerChildCount} to end of matchingRoutes
						end if
					end if
				end repeat
			on error
				return missing value
			end try
		end repeat
	end tell
	if (count of matchingRoutes) is not 1 then return missing value
	return item 1 of matchingRoutes
end getWorkspaceRoute

on getSessionTabs()
	set mainGroup to getMainGroup()
	if mainGroup is missing value then return {}
	tell application "System Events"
		try
			set mainElements to UI elements of mainGroup
			repeat with candidate in mainElements
				try
					if (role of candidate as text) is "AXTabGroup" then
						set tabGroupChildren to UI elements of candidate
						set sessionTabs to {}
						repeat with tabGroupChild in tabGroupChildren
							try
								if (role of tabGroupChild as text) is "AXRadioButton" then
									copy tabGroupChild to end of sessionTabs
								else
									set tabGroupElements to UI elements of tabGroupChild
									repeat with tabGroupElement in tabGroupElements
										try
											if (role of tabGroupElement as text) is "AXRadioButton" then copy tabGroupElement to end of sessionTabs
										end try
									end repeat
								end if
							end try
						end repeat
						return sessionTabs
					end if
				end try
			end repeat
		end try
	end tell
	return {}
end getSessionTabs

on getComposerGroup()
	set mainGroup to getMainGroup()
	if mainGroup is missing value then return missing value
	tell application "System Events"
		set mainElements to UI elements of mainGroup
		repeat with candidate in mainElements
			try
				if (description of candidate as text) is "composer" then return candidate
			end try
		end repeat
	end tell
	return missing value
end getComposerGroup

on getTextAreaFromComposer(composerGroup)
	if composerGroup is missing value then return missing value
	tell application "System Events"
		try
			set composerElements to UI elements of composerGroup
			repeat with candidate in composerElements
				try
					if (role of candidate as text) is "AXTextArea" then return candidate
				end try
			end repeat
		end try
	end tell
	return missing value
end getTextAreaFromComposer

on getTextArea()
	return my getTextAreaFromComposer(getComposerGroup())
end getTextArea

on workspaceLinkIsSelected(workspaceLink, workspaceName)
	if workspaceLink is missing value then return false
	tell application "System Events"
		try
			if (role of workspaceLink as text) is not "AXLink" then return false
			set candidateName to name of workspaceLink as text
			if my workspaceMatches(workspaceName, candidateName) is false then return false
			set candidateClasses to value of attribute "AXDOMClassList" of workspaceLink
			return candidateClasses contains "bg-sidebar-accent"
		end try
	end tell
	return false
end workspaceLinkIsSelected

on sessionIsSelected(sessionTitle, sessionOrdinal)
	tell application "System Events"
		set matchedCount to 0
		repeat with candidate in my getSessionTabs()
			try
				if (name of candidate as text) is ("Close chat " & sessionTitle) then
					set matchedCount to matchedCount + 1
					if matchedCount is sessionOrdinal then return value of candidate as boolean
				end if
			end try
		end repeat
	end tell
	return false
end sessionIsSelected

on commitAndPressMessage(textArea, inputScriptPath, conductorPid, workspaceContainerIndex, workspaceLinkIndex, sidebarChildCount, containerChildCount)
	tell application "System Events"
		tell process "Conductor" to set frontmost to true
		set focused of textArea to true
	end tell
	delay 0.05
	set routeEnvironment to "POCKET_WORKSPACE_CONTAINER_INDEX=" & (workspaceContainerIndex as text) & " POCKET_WORKSPACE_LINK_INDEX=" & (workspaceLinkIndex as text) & " POCKET_WORKSPACE_SIDEBAR_CHILD_COUNT=" & (sidebarChildCount as text) & " POCKET_WORKSPACE_CONTAINER_CHILD_COUNT=" & (containerChildCount as text)
	try
		set helperResult to do shell script "/usr/bin/env " & routeEnvironment & " POCKET_OPERATION=type-and-send /usr/bin/osascript -l JavaScript " & quoted form of inputScriptPath & " " & (conductorPid as text)
	on error errorText
		if errorText contains "draft_conflict" then return "draft_conflict"
		if errorText contains "session_locked" then return "session_locked"
		return "automation_failed"
	end try
	if helperResult starts with "pressed:" then return helperResult
	if helperResult starts with "ambiguous:" then return helperResult
	if helperResult starts with "interrupted:" then return helperResult
	if helperResult starts with "retryable:" then return helperResult
	if helperResult is "session_locked" then return helperResult
	return "automation_failed"
end commitAndPressMessage

on waitForInputIdle(inputScriptPath, conductorPid)
	try
		set helperResult to do shell script "/usr/bin/env POCKET_OPERATION=input-check /usr/bin/osascript -l JavaScript " & quoted form of inputScriptPath & " " & (conductorPid as text)
	on error errorText
		if errorText contains "session_locked" then return "session_locked"
		return "input_helper_unavailable"
	end try
	if helperResult is "ready" then return "ready"
	if helperResult is "busy" then return "busy"
	return "input_helper_unavailable"
end waitForInputIdle

set operationMode to system attribute "POCKET_OPERATION"
set inputScriptPath to system attribute "POCKET_INPUT_SCRIPT"

tell application "System Events"
	if UI elements enabled is false then return "{\"ok\":false,\"code\":\"accessibility_disabled\"}"
	if not (exists process "Conductor") then return "{\"ok\":false,\"code\":\"conductor_not_running\"}"
	tell process "Conductor"
		if not (exists front window) then return "{\"ok\":false,\"code\":\"conductor_window_unavailable\"}"
		set conductorPid to unix id
	end tell
end tell

if operationMode is "doctor" then
	set textArea to getTextArea()
	if textArea is missing value then
		return "{\"ok\":false,\"code\":\"composer_unavailable\"}"
	end if
	tell application "System Events"
		tell process "Conductor" to set frontmost to true
		set focused of textArea to true
	end tell
	try
		set helperResult to do shell script "/usr/bin/osascript -l JavaScript " & quoted form of inputScriptPath & " " & (conductorPid as text)
	on error errorText
		if errorText contains "session_locked" then return "{\"ok\":false,\"code\":\"session_locked\"}"
		return "{\"ok\":false,\"code\":\"input_helper_unavailable\"}"
	end try
	if helperResult is not "ready" then return "{\"ok\":false,\"code\":\"input_helper_unavailable\"}"
	return "{\"ok\":true,\"code\":\"ready\"}"
end if

set workspaceName to my decodeBase64(system attribute "POCKET_WORKSPACE_NAME_BASE64")
set sessionTitle to my decodeBase64(system attribute "POCKET_SESSION_TITLE_BASE64")
set sessionOrdinal to (system attribute "POCKET_SESSION_ORDINAL") as integer
set messageText to my decodeBase64(system attribute "POCKET_MESSAGE_BASE64")
set replaceDraft to (system attribute "POCKET_REPLACE_DRAFT") is "true"
set expectedDraft to my decodeBase64(system attribute "POCKET_EXPECTED_DRAFT_BASE64")
set retryInputCounters to system attribute "POCKET_EXPECTED_INPUT_COUNTERS"

set inputReadiness to my waitForInputIdle(inputScriptPath, conductorPid)
if inputReadiness is "busy" then return "{\"ok\":false,\"code\":\"user_input_active\"}"
if inputReadiness is "session_locked" then return "{\"ok\":false,\"code\":\"session_locked\"}"
if inputReadiness is not "ready" then return "{\"ok\":false,\"code\":\"input_helper_unavailable\"}"

set sidebarGroup to getSidebarGroup()
if sidebarGroup is missing value then return "{\"ok\":false,\"code\":\"workspace_list_unavailable\"}"
set workspaceRoute to my getWorkspaceRoute(workspaceName, sidebarGroup)
if workspaceRoute is missing value then return "{\"ok\":false,\"code\":\"workspace_not_visible\"}"
set workspaceLink to item 1 of workspaceRoute
set workspaceContainerIndex to item 2 of workspaceRoute
set workspaceLinkIndex to item 3 of workspaceRoute
set sidebarChildCount to item 4 of workspaceRoute
set containerChildCount to item 5 of workspaceRoute
tell application "System Events"
	set workspaceClasses to value of attribute "AXDOMClassList" of workspaceLink
	set routeAlreadySelected to false
	if workspaceClasses contains "bg-sidebar-accent" then
		set routeAlreadySelected to my sessionIsSelected(sessionTitle, sessionOrdinal)
	else
		if retryInputCounters is "" then perform action "AXPress" of workspaceLink
	end if
end tell

if retryInputCounters is not "" and routeAlreadySelected is false then return "{\"ok\":false,\"code\":\"user_input_active\"}"

set sessionFound to routeAlreadySelected
if sessionFound is false then
	repeat with waitIndex from 1 to 50
		delay 0.1
		tell application "System Events"
			set matchedCount to 0
			set sessionTabs to my getSessionTabs()
			repeat with candidate in sessionTabs
				try
					set candidateName to name of candidate as text
					if candidateName is ("Close chat " & sessionTitle) then
						set matchedCount to matchedCount + 1
						if matchedCount is sessionOrdinal then
							if (value of candidate as boolean) is false then perform action "AXPress" of candidate
							set sessionFound to true
							exit repeat
						end if
					end if
				end try
			end repeat
		end tell
		if sessionFound then exit repeat
	end repeat
end if

if sessionFound is false then return "{\"ok\":false,\"code\":\"session_not_visible\"}"

if routeAlreadySelected is false then
	set sidebarGroup to getSidebarGroup()
	if sidebarGroup is missing value then return "{\"ok\":false,\"code\":\"workspace_list_unavailable\"}"
	set workspaceRoute to my getWorkspaceRoute(workspaceName, sidebarGroup)
	if workspaceRoute is missing value then return "{\"ok\":false,\"code\":\"workspace_not_visible\"}"
	set workspaceLink to item 1 of workspaceRoute
	set workspaceContainerIndex to item 2 of workspaceRoute
	set workspaceLinkIndex to item 3 of workspaceRoute
	set sidebarChildCount to item 4 of workspaceRoute
	set containerChildCount to item 5 of workspaceRoute
end if

set stableRouteChecks to 0
repeat with waitIndex from 1 to 50
	delay 0.1
	if my workspaceLinkIsSelected(workspaceLink, workspaceName) and my sessionIsSelected(sessionTitle, sessionOrdinal) then
		set stableRouteChecks to stableRouteChecks + 1
		if stableRouteChecks is 3 then exit repeat
	else
		set stableRouteChecks to 0
	end if
end repeat
if stableRouteChecks is not 3 then return "{\"ok\":false,\"code\":\"session_not_visible\"}"

set textArea to missing value
repeat with waitIndex from 1 to 50
	set textArea to getTextArea()
	if textArea is not missing value then exit repeat
	delay 0.1
end repeat
if textArea is missing value then return "{\"ok\":false,\"code\":\"composer_unavailable\"}"

tell application "System Events"
	set existingDraft to my normalizedDraft(value of textArea as text)
	considering case
		if existingDraft is not messageText then
			if replaceDraft is false and existingDraft is not "" then return my draftConflict(existingDraft)
			if replaceDraft is true and existingDraft is not expectedDraft then return my draftConflict(existingDraft)
		end if
	end considering
end tell

if my workspaceLinkIsSelected(workspaceLink, workspaceName) is false then return "{\"ok\":false,\"code\":\"workspace_not_visible\"}"
if my sessionIsSelected(sessionTitle, sessionOrdinal) is false then return "{\"ok\":false,\"code\":\"session_not_visible\"}"

set commitResult to my commitAndPressMessage(textArea, inputScriptPath, conductorPid, workspaceContainerIndex, workspaceLinkIndex, sidebarChildCount, containerChildCount)
if commitResult is "draft_conflict" then
	set latestTextArea to getTextArea()
	if latestTextArea is missing value then return "{\"ok\":false,\"code\":\"composer_unavailable\"}"
	tell application "System Events"
		set latestDraft to my normalizedDraft(value of latestTextArea as text)
	end tell
	return my draftConflict(latestDraft)
end if
if commitResult starts with "pressed:" then
	set pressedAt to text 9 thru -1 of commitResult
	return "{\"ok\":true,\"code\":\"sent\",\"pressedAt\":" & pressedAt & ",\"composerOwned\":true}"
else if commitResult starts with "ambiguous:" then
	set pressedAt to text 11 thru -1 of commitResult
	return "{\"ok\":false,\"code\":\"send_not_confirmed\",\"pressedAt\":" & pressedAt & ",\"composerOwned\":true}"
else if commitResult starts with "interrupted:" then
	set pressedAt to text 13 thru -1 of commitResult
	return "{\"ok\":false,\"code\":\"send_interrupted\",\"pressedAt\":" & pressedAt & ",\"composerOwned\":false}"
else if commitResult starts with "retryable:" then
	set retryCertificate to text 11 thru -1 of commitResult
	return "{\"ok\":false,\"code\":\"composer_changed_pre_send\",\"retryCertificate\":\"" & retryCertificate & "\"}"
else if commitResult is "session_locked" then
	return "{\"ok\":false,\"code\":\"session_locked\"}"
else
	return "{\"ok\":false,\"code\":\"automation_failed\"}"
end if
