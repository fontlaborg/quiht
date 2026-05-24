# Task 003: Creating a Qt .ui renderer in HTML

We’ll work in ./quiht/ 

## Prep

- Examine the tools and CLI apps and skills at your disposal
- Write AGENTS.md which will guide you in using the tools and skills at your disposal, and in performing the tasks for this specific project. 
- Only after that, start working on the project. 

## Task 003.1

Into ./quiht/quiht-core/RESEARCH.md perform a detailed research on tools and techniques that we can use th create `quiht-core`,a TS+WASM (if needed) web app, deployable inside a purely client app, that can 

- read a number of .ui files from a Qt 5/6 QWidgets project 
    - take a user-provided .ui file, 
    - or take a .quiht.json that points to publicly accessible URLs of all .ui files and associated resources like images, which quiht can then access on the web
- then make the content of the .ui content viewable as HTML that imitates the rendering of the .ui file on a real Qt 5/6 QWidgets app (utilizing Qt 5/6 QWidgets CSS styles etc.). 

The code doesn’t have to implement any Qt functionality. Its main point is to have a .ui renderer in HTML which then can be enhanced or used in other projects. 

## Task 003.2

Into ./quiht/quiht-core/SPEC.md write a detailed spec for `quiht-core`.

## Task 003.3

Into ./quiht/quiht-l10n-vu/SPEC.md write a spec for a web app that is intended for reviewers of the localization process. It does the following: 

- relies on `quiht-core` 
- reads all .ui files that are prepped for localization
- reads some format of localization data (it can be produced by some special offline tool)
- presents the original strings and localized strings in actual visual context of the rendered .ui file.

## Task 003.4

Copy .ui + associated icon files from the ./fontlab/Proteus/ codebase into ./quiht/example/ 

Into ./quiht/quiht-tools/quiht-jsongen.py write a small Fire CLI app that will generate the .quiht.json from a provided file structure of .ui and .png etc. files, plus a provided URL prefix. The idea is that the .quiht.json file serves as a map that points to URLs of these .ui + .png files from which quiht can assemble the layout.

## Task 003.5

Into ./TODO.md write a series of groups, each containing a detailed task list of actionable `- [ ]`-prefixed items. Each group should group items that can be completed one after another, and that are independent of other groups. Clearly mark these groups are being parallelizable. Then into the final group write tasks that need to be completed after all the parallelizable tasks are completed. For the items, point to the respective specs etc. 

## Task 003.6

Implement the entire project. 

Verify the implementation. 

Iterate, review, refine, reverify. 

Iterate until all is perfect. 

