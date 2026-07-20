@browser
Feature: Browser smoke test

  Scenario: A headless browser can be launched and a blank page loaded
    Given a headless browser is open
    Then a new blank page can be loaded
