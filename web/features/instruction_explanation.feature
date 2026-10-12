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
