// content.js

document.addEventListener("DOMContentLoaded", () => {
    const links = document.querySelectorAll("a");
    links.forEach(link => {
        const rel = link.getAttribute("rel");
        if (rel && rel.includes("nofollow")) {
            link.style.border = "2px solid red";
            link.setAttribute("title", "Nofollow link");
        } else {
            link.style.border = "2px solid green";
            link.setAttribute("title", "Follow link");
        }
    });
});
