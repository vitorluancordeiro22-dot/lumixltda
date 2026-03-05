import React, { useState } from 'react';

const Settings = () => {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [profile, setProfile] = useState({ name: '', email: '' });

    const handleToggle = () => {
        setIsDarkMode(!isDarkMode);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setProfile({ ...profile, [name]: value });
    };

    return (
        <div className={isDarkMode ? 'settings dark-mode' : 'settings'}>
            <h1>Settings</h1>
            <div>
                <h2>Profile Settings</h2>
                <input type="text" name="name" placeholder="Name" value={profile.name} onChange={handleChange} />
                <input type="email" name="email" placeholder="Email" value={profile.email} onChange={handleChange} />
            </div>
            <div>
                <h2>Appearance</h2>
                <button onClick={handleToggle}>{isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</button>
            </div>
        </div>
    );
};

export default Settings;