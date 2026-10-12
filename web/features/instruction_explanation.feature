@browser
Feature: Instruction explanation
  The core user flow: clicking a highlighted Dockerfile keyword opens a side
  panel that explains what the instruction does.

  Background:
    Given the site is up

  Scenario: Clicking a Dockerfile instruction opens the explanation panel
    When I visit the home page
    And I click the "FROM" instruction
    Then the explanation panel is open
    And the explanation panel shows the title "FROM"

  Scenario: The explanation panel can be dismissed with the close button
    When I visit the home page
    And I click the "RUN" instruction
    Then the explanation panel is open
    When I close the explanation panel
    Then the explanation panel is closed

  Scenario: Clicking a different instruction updates the explanation panel
    When I visit the home page
    And I click the "FROM" instruction
    Then the explanation panel shows the title "FROM"
    When I click the "WORKDIR" instruction
    Then the explanation panel shows the title "WORKDIR"

  Scenario: Command fragments on continuation lines are explained in context
    When I visit the home page
    And I select the "Complex" example
    And I click the "--omit=dev" command fragment
    Then the explanation panel shows the title "--omit=dev"
    And I should see the text "skip installing dependencies of this type"

  Scenario: The Dockerfile and the panel work with the keyboard alone
    When I visit the home page
    And I press Tab until the Dockerfile viewer has focus
    Then focus is on the "FROM" token
    When I press "ArrowDown"
    And I press "Enter"
    Then the explanation panel shows the title "WORKDIR"
    And focus is on the "WORKDIR" token
    When I press "Tab"
    Then focus is inside the explanation panel
    When I press "Escape"
    Then the explanation panel is closed
    And focus is on the "WORKDIR" token

  Scenario: The panel sits beside the Dockerfile on wide screens
    Given the viewport is 1280 by 800
    When I visit the home page
    And I click the "FROM" instruction
    Then the explanation panel is between 320 and 480 pixels wide

  Scenario: On narrow screens the panel is a bottom sheet that keeps the token visible
    Given the viewport is 375 by 700
    When I visit the home page
    And I select the "Complex" example
    And I click the "ENTRYPOINT" instruction
    Then the explanation panel is pinned to the bottom of the viewport
    And the "ENTRYPOINT" token is above the explanation panel
