const menu = [
    {
        icon: "dashboard",
        text: "Dashboard",
        link: "/portal",
    },
    {
        icon: "bar-chart",
        text: "Statistics",
        active: false,
        subMenu: [
            {
                text: "Internet",
                link: "/portal/statistics/internet-statistics",
            },
        ],
    },
    {
        icon: "star",
        text: "My services",
        link: "/portal/services",
    },
    /*
    {
        icon: "wallet",
        text: "Finance",
        active: false,
        subMenu: [
            {
                text: "Invoices",
                link: "/portal/finance/invoices",
            },
            {
                text: "Payments",
                link: "/portal/finance/payments",
            },
        ],
    },
    */
];
export default menu;
